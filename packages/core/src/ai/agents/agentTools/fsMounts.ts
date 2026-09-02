import { promises as fs } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

export interface FsMount {
  name: string;
  root: string;
  include?: string[];
  exclude?: string[];
}

export type FsWriteMount = FsMount;

export interface ResolvedFsMount extends FsMount {
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

export function isAllowedMountFile(mount: ResolvedFsMount, absolutePath: string): boolean {
  const rel = mountRelativePath(mount, absolutePath);
  if (rel == null || matchesAnyGlob(rel, mount.exclude)) return false;
  return !mount.include?.length || matchesAnyGlob(rel, mount.include);
}

export function buildMounts(repoRoot: string): Map<string, ResolvedFsMount> {
  return new Map<string, ResolvedFsMount>([
    [
      'project',
      {
        name: 'project',
        root: resolve(repoRoot),
        exclude: ['.git/**', 'node_modules/**'],
      },
    ],
  ]);
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
