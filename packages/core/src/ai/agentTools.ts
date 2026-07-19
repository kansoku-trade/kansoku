import { exec as nodeExec } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { delimiter, dirname, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';
import { skillSearchDirs } from '../env.js';
import { locateLongbridgeCli } from '../services/longbridgeCli.js';
import { loadSkillIndex, readSkill, type SkillMeta } from '../services/skills.js';
import { textResult } from './dataTools.js';

const OUTPUT_TRUNCATE_CHARS = 30_000;
const READ_FILE_MAX_CHARS = 100_000;
const GREP_FILE_MAX_CHARS = 512_000;
const FS_SCAN_MAX_FILES = 5_000;
const FS_RESULT_DEFAULT_LIMIT = 100;
const FS_RESULT_MAX_LIMIT = 500;
const REJECTED_PATTERNS = [/>>?/, /\btee\s/, /\brm\s/, /\bmv\s/, /\bcp\s/];
const BASH_TIMEOUT_MS = 120_000;
const BASH_MAX_BUFFER = 10 * 1024 * 1024;

export type ExecResult = { stdout: string; stderr: string };
export type ExecFn = (command: string) => Promise<ExecResult>;

export interface FsReadMount {
  name: string;
  root: string;
  include?: string[];
  exclude?: string[];
}

interface ResolvedFsMount extends FsReadMount {
  root: string;
}

const nodeExecAsync = promisify(nodeExec);

const EXTRA_BIN_DIRS = ['/opt/homebrew/bin', '/usr/local/bin'];

function mergePathDirs(basePath: string | undefined, extraDirs: string[]): string {
  const dirs = (basePath ?? '').split(delimiter).filter(Boolean);
  for (const dir of extraDirs) {
    if (!dirs.includes(dir)) dirs.push(dir);
  }
  return dirs.join(delimiter);
}

let cachedExecPathPromise: Promise<string> | null = null;

// Finder-launched Electron inherits a bare PATH (/usr/bin:/bin:...), so the
// longbridge CLI resolvable by the kernel is invisible to plain `sh -c`.
function resolveExecPath(): Promise<string> {
  cachedExecPathPromise ??= (async () => {
    const extra = [...EXTRA_BIN_DIRS];
    try {
      extra.push(dirname(await locateLongbridgeCli()));
    } catch {}
    return mergePathDirs(process.env.PATH, extra);
  })();
  return cachedExecPathPromise;
}

export function createDefaultExec(repoRoot: string): ExecFn {
  return async (command: string) => {
    const { stdout, stderr } = await nodeExecAsync(command, {
      cwd: repoRoot,
      timeout: BASH_TIMEOUT_MS,
      maxBuffer: BASH_MAX_BUFFER,
      env: { ...process.env, PATH: await resolveExecPath() },
    });
    return { stdout, stderr };
  };
}

export function truncateOutput(text: string): string {
  if (text.length <= OUTPUT_TRUNCATE_CHARS) return text;
  return `${text.slice(0, OUTPUT_TRUNCATE_CHARS)}\n...[truncated]`;
}

export function isRejectedCommand(command: string): boolean {
  return REJECTED_PATTERNS.some((re) => re.test(command));
}

export function resolveRepoRelative(repoRoot: string, rawPath: string): string | null {
  const resolved = resolve(repoRoot, rawPath);
  const rel = relative(repoRoot, resolved);
  if (rel.startsWith('..') || resolve(repoRoot, rel) !== resolved) return null;
  return resolved;
}

function slashPath(path: string): string {
  return path.split(sep).join('/');
}

function globRegex(glob: string): RegExp {
  let source = '^';
  for (let index = 0; index < glob.length; index++) {
    const char = glob[index];
    const next = glob[index + 1];
    if (char === '*' && next === '*') {
      const after = glob[index + 2];
      source += after === '/' ? '(?:.*/)?' : '.*';
      index += after === '/' ? 2 : 1;
      continue;
    }
    if (char === '*') {
      source += '[^/]*';
      continue;
    }
    if (char === '?') {
      source += '[^/]';
      continue;
    }
    source += /[\\^$.*+?()[\]{}|]/.test(char) ? `\\${char}` : char;
  }
  return new RegExp(`${source}$`);
}

function expandGlobBraces(glob: string): string[] {
  const output: string[] = [];
  const pending = [glob];
  while (pending.length > 0 && output.length < 128) {
    const current = pending.pop()!;
    const match = /\{([^{}]+)\}/.exec(current);
    if (!match || match.index == null) {
      output.push(current);
      continue;
    }
    const before = current.slice(0, match.index);
    const after = current.slice(match.index + match[0].length);
    for (const choice of match[1].split(',').slice(0, 32)) {
      if (pending.length + output.length >= 128) break;
      pending.push(`${before}${choice}${after}`);
    }
  }
  return output;
}

function matchesGlob(path: string, glob: string): boolean {
  return expandGlobBraces(glob).some((expanded) => {
    const regex = globRegex(expanded);
    if (regex.test(path)) return true;
    if (expanded.includes('/')) return false;
    return regex.test(path.split('/').at(-1) ?? path);
  });
}

function matchesAnyGlob(path: string, globs: readonly string[] | undefined): boolean {
  return Boolean(
    globs?.some((glob) => {
      if (glob.endsWith('/**') && path === glob.slice(0, -3)) return true;
      return matchesGlob(path, glob);
    }),
  );
}

function mountRelativePath(mount: ResolvedFsMount, absolutePath: string): string | null {
  const rel = slashPath(relative(mount.root, absolutePath));
  if (!rel || rel === '.') return '';
  if (rel.startsWith('../') || rel === '..') return null;
  return rel;
}

function isExcludedMountPath(mount: ResolvedFsMount, absolutePath: string): boolean {
  const rel = mountRelativePath(mount, absolutePath);
  return rel == null || (rel !== '' && matchesAnyGlob(rel, mount.exclude));
}

function isAllowedMountFile(mount: ResolvedFsMount, absolutePath: string): boolean {
  const rel = mountRelativePath(mount, absolutePath);
  if (rel == null || matchesAnyGlob(rel, mount.exclude)) return false;
  return !mount.include?.length || matchesAnyGlob(rel, mount.include);
}

function buildMounts(
  repoRoot: string,
  extra: readonly FsReadMount[],
): Map<string, ResolvedFsMount> {
  const mounts = new Map<string, ResolvedFsMount>([
    [
      'project',
      {
        name: 'project',
        root: resolve(repoRoot),
        exclude: ['.git/**', 'node_modules/**'],
      },
    ],
  ]);
  for (const mount of extra) {
    if (!/^[a-z][a-z0-9_-]{0,31}$/.test(mount.name) || mounts.has(mount.name)) continue;
    mounts.set(mount.name, { ...mount, root: resolve(mount.root) });
  }
  return mounts;
}

function resolveMountedPath(
  mounts: ReadonlyMap<string, ResolvedFsMount>,
  mountName: string | undefined,
  rawPath: string | undefined,
): { mount: ResolvedFsMount; path: string } | null {
  if (rawPath?.includes('\0')) return null;
  const mount = mounts.get(mountName ?? 'project');
  if (!mount) return null;
  const path = resolve(mount.root, rawPath || '.');
  const rel = relative(mount.root, path);
  if (rel === '..' || rel.startsWith(`..${sep}`)) return null;
  return { mount, path };
}

async function isSymlinkSafe(mount: ResolvedFsMount, path: string): Promise<boolean> {
  try {
    const [realRoot, realPath] = await Promise.all([fs.realpath(mount.root), fs.realpath(path)]);
    const rel = relative(realRoot, realPath);
    return rel !== '..' && !rel.startsWith(`..${sep}`);
  } catch {
    return false;
  }
}

async function collectFiles(
  mount: ResolvedFsMount,
  startPath: string,
  maxFiles = FS_SCAN_MAX_FILES,
): Promise<string[]> {
  const out: string[] = [];
  const stat = await fs.lstat(startPath);
  if (stat.isSymbolicLink()) return out;
  if (stat.isFile()) {
    if (isAllowedMountFile(mount, startPath)) out.push(startPath);
    return out;
  }
  if (!stat.isDirectory()) return out;

  const pending = [startPath];
  while (pending.length > 0 && out.length < maxFiles) {
    const dir = pending.pop()!;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const path = resolve(dir, entry.name);
      if (isExcludedMountPath(mount, path)) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) pending.push(path);
      else if (entry.isFile() && isAllowedMountFile(mount, path)) out.push(path);
      if (out.length >= maxFiles) break;
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

const readSkillSchema = Type.Object({ name: Type.String() });
const bashSchema = Type.Object({ command: Type.String() });
const readFileSchema = Type.Object({
  path: Type.String({ minLength: 1, maxLength: 2_000 }),
  mount: Type.Optional(Type.String({ minLength: 1, maxLength: 32 })),
});

const listFilesSchema = Type.Object({
  mount: Type.Optional(Type.String({ minLength: 1, maxLength: 32 })),
  path: Type.Optional(Type.String({ maxLength: 2_000 })),
  glob: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
  head_limit: Type.Optional(Type.Integer({ minimum: 1, maximum: FS_RESULT_MAX_LIMIT })),
  offset: Type.Optional(Type.Integer({ minimum: 0 })),
});

const grepSchema = Type.Object({
  'pattern': Type.String({ minLength: 1, maxLength: 2_000 }),
  'mount': Type.Optional(Type.String({ minLength: 1, maxLength: 32 })),
  'path': Type.Optional(Type.String({ maxLength: 2_000 })),
  'glob': Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
  'type': Type.Optional(Type.String({ minLength: 1, maxLength: 32 })),
  'output_mode': Type.Optional(
    Type.Union([
      Type.Literal('content'),
      Type.Literal('files_with_matches'),
      Type.Literal('count'),
    ]),
  ),
  '-B': Type.Optional(Type.Integer({ minimum: 0, maximum: 20 })),
  '-A': Type.Optional(Type.Integer({ minimum: 0, maximum: 20 })),
  '-C': Type.Optional(Type.Integer({ minimum: 0, maximum: 20 })),
  '-n': Type.Optional(Type.Boolean()),
  '-i': Type.Optional(Type.Boolean()),
  'head_limit': Type.Optional(Type.Integer({ minimum: 1, maximum: FS_RESULT_MAX_LIMIT })),
  'offset': Type.Optional(Type.Integer({ minimum: 0 })),
  'multiline': Type.Optional(Type.Boolean()),
});

export function buildReadSkillTool(
  skillIndex: SkillMeta[],
  onRead?: (name: string) => void,
): AgentTool<typeof readSkillSchema> {
  return {
    name: 'read_skill',
    label: 'Read Skill',
    description: 'Load the full SKILL.md text for a named skill.',
    parameters: readSkillSchema,
    execute: async (_id, params) => {
      const text = readSkill(skillIndex, params.name);
      if (text) onRead?.(params.name);
      return textResult(text ?? `unknown skill: ${params.name}`);
    },
  };
}

export function buildBashTool(exec: ExecFn): AgentTool<typeof bashSchema> {
  return {
    name: 'bash',
    label: 'Bash',
    description: 'Run a shell command (cwd = repo root). Read-only commands only; no file writes.',
    parameters: bashSchema,
    execute: async (_id, params) => {
      const command = params.command;
      if (isRejectedCommand(command)) {
        return textResult(`rejected: command "${command}" matches a disallowed write pattern`);
      }
      try {
        const { stdout, stderr } = await exec(command);
        return textResult(truncateOutput(`${stdout}${stderr ? `\n[stderr]\n${stderr}` : ''}`));
      } catch (err) {
        return textResult(`command failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  };
}

export function buildReadFileTool(
  repoRoot: string,
  readMounts: readonly FsReadMount[] = [],
): AgentTool<typeof readFileSchema> {
  const mounts = buildMounts(repoRoot, readMounts);
  return {
    name: 'read_file',
    label: 'Read File',
    description:
      'Read a UTF-8 file from an available filesystem mount. Paths are relative to the selected mount.',
    parameters: readFileSchema,
    execute: async (_id, params) => {
      const rawPath = params.path;
      const resolved = resolveMountedPath(mounts, params.mount, rawPath);
      if (!resolved) {
        return textResult(`rejected: invalid mount or path outside mount root: ${rawPath}`);
      }
      if (!isAllowedMountFile(resolved.mount, resolved.path)) {
        return textResult(
          `rejected: path is not readable from mount ${resolved.mount.name}: ${rawPath}`,
        );
      }
      try {
        if (!(await isSymlinkSafe(resolved.mount, resolved.path))) {
          return textResult(`rejected: path resolves outside mount root: ${rawPath}`);
        }
        const stat = await fs.stat(resolved.path);
        if (!stat.isFile()) return textResult(`read failed: not a file: ${rawPath}`);
        const content = await fs.readFile(resolved.path, 'utf8');
        return textResult(
          content.length > READ_FILE_MAX_CHARS ? content.slice(0, READ_FILE_MAX_CHARS) : content,
        );
      } catch (err) {
        return textResult(`read failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  };
}

export function buildListFilesTool(
  repoRoot: string,
  readMounts: readonly FsReadMount[],
): AgentTool<typeof listFilesSchema> {
  const mounts = buildMounts(repoRoot, readMounts);
  return {
    name: 'list_files',
    label: 'List Files',
    description:
      'List files under a filesystem mount. Paths are relative to the selected mount and may be filtered with a glob.',
    parameters: listFilesSchema,
    execute: async (_id, params) => {
      const resolved = resolveMountedPath(mounts, params.mount, params.path);
      if (!resolved) return textResult('rejected: invalid mount or path outside mount root');
      if (isExcludedMountPath(resolved.mount, resolved.path)) {
        return textResult(`rejected: path is excluded from mount ${resolved.mount.name}`);
      }
      try {
        if (!(await isSymlinkSafe(resolved.mount, resolved.path))) {
          return textResult('rejected: path resolves outside mount root');
        }
        let paths = await collectFiles(resolved.mount, resolved.path);
        paths = paths.map((path) => mountRelativePath(resolved.mount, path) ?? '').filter(Boolean);
        if (params.glob) paths = paths.filter((path) => matchesGlob(path, params.glob!));
        const offset = params.offset ?? 0;
        const limit = params.head_limit ?? FS_RESULT_DEFAULT_LIMIT;
        const page = paths.slice(offset, offset + limit);
        const suffix =
          offset + page.length < paths.length
            ? `\n...[${paths.length - offset - page.length} more files]`
            : '';
        return textResult(page.length > 0 ? `${page.join('\n')}${suffix}` : 'No files found.');
      } catch (err) {
        return textResult(`list failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  };
}

const FILE_TYPE_EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
  c: ['.c', '.h'],
  cpp: ['.cc', '.cpp', '.cxx', '.hh', '.hpp', '.hxx'],
  css: ['.css'],
  go: ['.go'],
  html: ['.htm', '.html'],
  java: ['.java'],
  md: ['.md', '.mdx'],
  markdown: ['.md', '.mdx'],
  js: ['.js', '.jsx', '.mjs', '.cjs'],
  json: ['.json', '.jsonc'],
  jsx: ['.jsx'],
  kotlin: ['.kt', '.kts'],
  py: ['.py', '.pyi'],
  python: ['.py', '.pyi'],
  ruby: ['.rb'],
  rust: ['.rs'],
  scss: ['.scss'],
  shell: ['.bash', '.sh', '.zsh'],
  sql: ['.sql'],
  swift: ['.swift'],
  toml: ['.toml'],
  ts: ['.ts', '.tsx'],
  tsx: ['.tsx'],
  txt: ['.txt'],
  xml: ['.xml'],
  yaml: ['.yaml', '.yml'],
  yml: ['.yaml', '.yml'],
};

function matchesFileType(path: string, type: string | undefined): boolean {
  if (!type) return true;
  const extensions = FILE_TYPE_EXTENSIONS[type.toLowerCase()];
  if (!extensions) return false;
  const lower = path.toLowerCase();
  return extensions.some((extension) => lower.endsWith(extension));
}

function compileGrepPattern(pattern: string, ignoreCase: boolean, multiline: boolean): RegExp {
  return new RegExp(pattern, `g${ignoreCase ? 'i' : ''}${multiline ? 'ms' : ''}`);
}

function matchingLineIndexes(lines: readonly string[], pattern: RegExp): number[] {
  const indexes: number[] = [];
  for (let index = 0; index < lines.length; index++) {
    pattern.lastIndex = 0;
    if (pattern.test(lines[index])) indexes.push(index);
  }
  return indexes;
}

function contentRows(
  relativePath: string,
  lines: readonly string[],
  matches: readonly number[],
  before: number,
  after: number,
  lineNumbers: boolean,
): string[] {
  const matchSet = new Set(matches);
  const visible = new Set<number>();
  for (const index of matches) {
    for (
      let current = Math.max(0, index - before);
      current <= Math.min(lines.length - 1, index + after);
      current++
    ) {
      visible.add(current);
    }
  }
  return [...visible]
    .sort((a, b) => a - b)
    .map((index) => {
      const separator = matchSet.has(index) ? ':' : '-';
      return lineNumbers
        ? `${relativePath}${separator}${index + 1}${separator}${lines[index]}`
        : `${relativePath}${separator}${lines[index]}`;
    });
}

export function buildGrepTool(
  repoRoot: string,
  readMounts: readonly FsReadMount[],
): AgentTool<typeof grepSchema> {
  const mounts = buildMounts(repoRoot, readMounts);
  return {
    name: 'grep',
    label: 'Grep',
    description:
      'Search files with a regular expression. Defaults to files_with_matches; supports content, count, glob, type, context, pagination, and multiline modes.',
    parameters: grepSchema,
    execute: async (_id, params) => {
      const resolved = resolveMountedPath(mounts, params.mount, params.path);
      if (!resolved) return textResult('rejected: invalid mount or path outside mount root');
      if (isExcludedMountPath(resolved.mount, resolved.path)) {
        return textResult(`rejected: path is excluded from mount ${resolved.mount.name}`);
      }

      let pattern: RegExp;
      try {
        pattern = compileGrepPattern(
          params.pattern,
          params['-i'] ?? false,
          params.multiline ?? false,
        );
      } catch (err) {
        return textResult(
          `invalid regular expression: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      if (params.type && !FILE_TYPE_EXTENSIONS[params.type.toLowerCase()]) {
        return textResult(`unsupported file type: ${params.type}`);
      }

      try {
        if (!(await isSymlinkSafe(resolved.mount, resolved.path))) {
          return textResult('rejected: path resolves outside mount root');
        }
        let files = await collectFiles(resolved.mount, resolved.path);
        files = files.filter((path) => {
          const rel = mountRelativePath(resolved.mount, path);
          return Boolean(
            rel &&
            (!params.glob || matchesGlob(rel, params.glob)) &&
            matchesFileType(rel, params.type),
          );
        });

        const mode = params.output_mode ?? 'files_with_matches';
        const before = params['-C'] ?? params['-B'] ?? 0;
        const after = params['-C'] ?? params['-A'] ?? 0;
        const rows: string[] = [];
        let totalMatches = 0;

        for (const file of files) {
          const stat = await fs.stat(file);
          if (stat.size > GREP_FILE_MAX_CHARS) continue;
          const content = await fs.readFile(file, 'utf8');
          if (content.includes('\0')) continue;
          const rel = mountRelativePath(resolved.mount, file);
          if (!rel) continue;

          if (params.multiline) {
            pattern.lastIndex = 0;
            const matches = [...content.matchAll(pattern)];
            if (matches.length === 0) continue;
            totalMatches += matches.length;
            if (mode === 'files_with_matches') rows.push(rel);
            else if (mode === 'count') rows.push(`${rel}:${matches.length}`);
            else {
              for (const match of matches) {
                const line = content.slice(0, match.index).split('\n').length;
                const value = match[0].replaceAll('\n', '\\n');
                rows.push(params['-n'] === false ? `${rel}:${value}` : `${rel}:${line}:${value}`);
              }
            }
            continue;
          }

          const lines = content.split(/\r?\n/);
          const matches = matchingLineIndexes(lines, pattern);
          if (matches.length === 0) continue;
          totalMatches += matches.length;
          if (mode === 'files_with_matches') rows.push(rel);
          else if (mode === 'count') rows.push(`${rel}:${matches.length}`);
          else {
            rows.push(...contentRows(rel, lines, matches, before, after, params['-n'] !== false));
          }
        }

        if (mode === 'count' && rows.length > 0) rows.push(`total:${totalMatches}`);
        const offset = params.offset ?? 0;
        const limit = params.head_limit ?? FS_RESULT_DEFAULT_LIMIT;
        const page = rows.slice(offset, offset + limit);
        const suffix =
          offset + page.length < rows.length
            ? `\n...[${rows.length - offset - page.length} more results]`
            : '';
        return textResult(page.length > 0 ? `${page.join('\n')}${suffix}` : 'No matches found.');
      } catch (err) {
        return textResult(`grep failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  };
}

export interface ResearchToolsOptions {
  repoRoot: string;
  exec?: ExecFn;
  skillIndex?: SkillMeta[];
  onSkillRead?: (name: string) => void;
  readMounts?: FsReadMount[];
}

export function buildResearchTools(opts: ResearchToolsOptions): {
  tools: AgentTool[];
  skillIndex: SkillMeta[];
} {
  const exec = opts.exec ?? createDefaultExec(opts.repoRoot);
  const skillIndex = opts.skillIndex ?? loadSkillIndex(skillSearchDirs(opts.repoRoot));
  const readMounts = opts.readMounts ?? [];

  return {
    tools: [
      buildReadSkillTool(skillIndex, opts.onSkillRead),
      buildBashTool(exec),
      buildReadFileTool(opts.repoRoot, readMounts),
      ...(readMounts.length > 0
        ? [buildListFilesTool(opts.repoRoot, readMounts), buildGrepTool(opts.repoRoot, readMounts)]
        : []),
    ],
    skillIndex,
  };
}
