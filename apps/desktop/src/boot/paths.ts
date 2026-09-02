import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Walk up from wherever this module physically sits until the repo root
// (identified by apps/desktop/package.json) is found — this stays correct
// whether the code runs bundled at dist-main/main.mjs, from TS source under
// src/boot/, or from any other relocated output. Packaged builds have no repo
// layout on disk, so fall back to the historical fixed-depth guess; every
// caller guards the result with existsSync before using it.
export function resolveRepoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'apps', 'desktop', 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
}

export interface DesktopStoragePaths {
  workspaceRoot: string;
  stateRoot: string;
  databasePath: string;
}

export function resolveDesktopStoragePaths(input: {
  isPackaged: boolean;
  envOverride: string | undefined;
  userDataPath: string;
  iCloudWorkspacePath?: string | null;
}): DesktopStoragePaths {
  const workspaceRoot = input.envOverride
    ? input.envOverride
    : !input.isPackaged
      ? resolveRepoRoot()
      : (input.iCloudWorkspacePath ?? join(input.userDataPath, 'Workspace'));
  const stateRoot = join(input.userDataPath, 'State');
  return {
    workspaceRoot,
    stateRoot,
    databasePath: input.isPackaged
      ? join(stateRoot, 'app.db')
      : join(workspaceRoot, 'journal', 'charts', 'data', 'app.db'),
  };
}

const DATA_ROOT_SUBDIRS = [
  'journal',
  join('journal', 'charts', 'data'),
  join('journal', 'charts', 'annotations'),
  'stocks',
];

export function scaffoldDataRoot(root: string): void {
  for (const rel of DATA_ROOT_SUBDIRS) {
    mkdirSync(join(root, rel), { recursive: true });
  }
}
