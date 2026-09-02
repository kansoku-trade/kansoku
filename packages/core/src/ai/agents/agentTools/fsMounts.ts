import { promises as fs } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

export const FS_SCAN_MAX_FILES = 5_000;
export const FS_RESULT_DEFAULT_LIMIT = 100;
export const FS_RESULT_MAX_LIMIT = 500;

export interface FsReadMount {
  name: string;
  root: string;
  include?: string[];
  exclude?: string[];
}

export type FsWriteMount = FsReadMount;

export interface ResolvedFsMount extends FsReadMount {
  root: string;
}

export function resolveRepoRelative(repoRoot: string, rawPath: string): string | null {
  const resolved = resolve(repoRoot, rawPath);
  const rel = relative(repoRoot, resolved);
  if (rel.startsWith('..') || resolve(repoRoot, rel) !== resolved) return null;
  return resolved;
}

export function slashPath(path: string): string {
  return path.split(sep).join('/');
}

export function globRegex(glob: string): RegExp {
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

export function expandGlobBraces(glob: string): string[] {
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

export function matchesGlob(path: string, glob: string): boolean {
  return expandGlobBraces(glob).some((expanded) => {
    const regex = globRegex(expanded);
    if (regex.test(path)) return true;
    if (expanded.includes('/')) return false;
    return regex.test(path.split('/').at(-1) ?? path);
  });
}

export function matchesAnyGlob(path: string, globs: readonly string[] | undefined): boolean {
  return Boolean(
    globs?.some((glob) => {
      if (glob.endsWith('/**') && path === glob.slice(0, -3)) return true;
      return matchesGlob(path, glob);
    }),
  );
}

export function mountRelativePath(mount: ResolvedFsMount, absolutePath: string): string | null {
  const rel = slashPath(relative(mount.root, absolutePath));
  if (!rel || rel === '.') return '';
  if (rel.startsWith('../') || rel === '..') return null;
  return rel;
}

export function isExcludedMountPath(mount: ResolvedFsMount, absolutePath: string): boolean {
  const rel = mountRelativePath(mount, absolutePath);
  return rel == null || (rel !== '' && matchesAnyGlob(rel, mount.exclude));
}

export function isAllowedMountFile(mount: ResolvedFsMount, absolutePath: string): boolean {
  const rel = mountRelativePath(mount, absolutePath);
  if (rel == null || matchesAnyGlob(rel, mount.exclude)) return false;
  return !mount.include?.length || matchesAnyGlob(rel, mount.include);
}

export function buildMounts(
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

export function resolveMountedPath(
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

export async function isSymlinkSafe(mount: ResolvedFsMount, path: string): Promise<boolean> {
  try {
    const [realRoot, realPath] = await Promise.all([fs.realpath(mount.root), fs.realpath(path)]);
    const rel = relative(realRoot, realPath);
    return rel !== '..' && !rel.startsWith(`..${sep}`);
  } catch {
    return false;
  }
}

export async function collectFiles(
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
