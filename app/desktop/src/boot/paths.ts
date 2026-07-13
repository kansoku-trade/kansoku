import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Walk up from wherever this module physically sits until the repo root
// (identified by app/desktop/package.json) is found — this stays correct
// whether the code runs bundled at dist-main/main.mjs, from TS source under
// src/boot/, or from any other relocated output. Packaged builds have no repo
// layout on disk, so fall back to the historical fixed-depth guess; every
// caller guards the result with existsSync before using it.
export function resolveRepoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "app", "desktop", "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
}

export interface DataRootOptions {
  isPackaged: boolean;
  envOverride: string | undefined;
  userDataPath: string;
  customPath?: string | null;
  customPathUsable?: boolean;
}

export function resolveDataRoot(opts: DataRootOptions): string {
  if (opts.envOverride) return opts.envOverride;
  if (!opts.isPackaged) return resolveRepoRoot();
  if (opts.customPath && opts.customPathUsable) return opts.customPath;
  return opts.userDataPath;
}

const DATA_ROOT_SUBDIRS = [
  "journal",
  join("journal", "charts", "data"),
  join("journal", "charts", "annotations"),
  "stocks",
];

export function scaffoldDataRoot(root: string): void {
  for (const rel of DATA_ROOT_SUBDIRS) {
    mkdirSync(join(root, rel), { recursive: true });
  }
}
