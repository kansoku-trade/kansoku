import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const SYSTEM_EXTRA_BIN_DIRS = ['/opt/homebrew/bin', '/usr/local/bin'] as const;

export type PathExec = typeof execFileAsync;

export interface UserPathDeps {
  env?: NodeJS.ProcessEnv;
  exec?: PathExec;
  shell?: string;
}

let cachedShellPathPromise: Promise<string | null> | null = null;

export function resetUserPathCacheForTests(): void {
  cachedShellPathPromise = null;
}

export function resolveHomeDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.HOME ?? process.env.HOME ?? homedir();
}

export function homeExtraBinDirs(home: string = resolveHomeDir()): string[] {
  if (!home) return [];
  return [
    join(home, '.n', 'bin'),
    join(home, '.local', 'bin'),
    join(home, '.npm-global', 'bin'),
    join(home, '.yarn', 'bin'),
    join(home, '.config', 'yarn', 'global', 'node_modules', '.bin'),
    join(home, '.volta', 'bin'),
    join(home, '.bun', 'bin'),
    join(home, 'Library', 'pnpm'),
  ];
}

export function mergePathDirs(
  basePath: string | undefined,
  extraDirs: readonly string[],
): string {
  const dirs = (basePath ?? '').split(delimiter).filter(Boolean);
  for (const dir of extraDirs) {
    if (dir && !dirs.includes(dir)) dirs.push(dir);
  }
  return dirs.join(delimiter);
}

export function staticAugmentedPath(
  basePath: string | undefined,
  home: string = resolveHomeDir(),
  extraDirs: readonly string[] = [],
): string {
  return mergePathDirs(basePath, [
    ...extraDirs,
    ...SYSTEM_EXTRA_BIN_DIRS,
    ...homeExtraBinDirs(home),
  ]);
}

export async function resolveShellUserPath(deps: UserPathDeps = {}): Promise<string | null> {
  const useCache = deps.env === undefined && deps.exec === undefined && deps.shell === undefined;
  if (useCache && cachedShellPathPromise) return cachedShellPathPromise;

  const run = async (): Promise<string | null> => {
    const exec = deps.exec ?? execFileAsync;
    const env = deps.env ?? process.env;
    const shell = deps.shell ?? env.SHELL ?? process.env.SHELL ?? '/bin/zsh';
    try {
      const { stdout } = await exec(shell, ['-lic', 'printenv PATH'], {
        timeout: 5_000,
        maxBuffer: 64 * 1024,
        env: { ...env, TERM: 'dumb' },
      });
      const path = stdout
        .trim()
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .at(-1);
      if (!path) return null;
      return path.includes('/') ? path : null;
    } catch {
      return null;
    }
  };

  if (useCache) {
    cachedShellPathPromise = run();
    return cachedShellPathPromise;
  }
  return run();
}

export async function resolveAugmentedPath(
  deps: UserPathDeps & { extraDirs?: readonly string[] } = {},
): Promise<string> {
  const env = deps.env ?? process.env;
  const home = resolveHomeDir(env);
  let path = staticAugmentedPath(env.PATH, home, deps.extraDirs ?? []);
  const shellPath = await resolveShellUserPath(deps);
  if (shellPath) {
    path = mergePathDirs(path, shellPath.split(delimiter));
  }
  return path;
}
