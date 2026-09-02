import { existsSync, lstatSync, readdirSync, realpathSync } from 'node:fs';
import { join, relative } from 'node:path';
import { copyUserContentSafely } from '../../storage/migration.js';

const USER_CONTENT_DIRS = ['journal', 'stocks'] as const;
const EXCLUDED_FILES = new Set([
  join('journal', 'charts', 'data', 'app.db'),
  join('journal', 'charts', 'data', 'app.db-wal'),
  join('journal', 'charts', 'data', 'app.db-shm'),
]);

export type SourceValidation =
  { ok: true } | { ok: false; reason: 'self' | 'missing-content' | 'empty' };

export function validateImportSource(sourceRoot: string, destRoot: string): SourceValidation {
  if (realpathOrSelf(sourceRoot) === realpathOrSelf(destRoot)) {
    return { ok: false, reason: 'self' };
  }
  if (!USER_CONTENT_DIRS.some((name) => existsSync(join(sourceRoot, name)))) {
    return { ok: false, reason: 'missing-content' };
  }
  if (!USER_CONTENT_DIRS.some((name) => hasImportableFile(sourceRoot, join(sourceRoot, name)))) {
    return { ok: false, reason: 'empty' };
  }
  return { ok: true };
}

export function importUserContent(sourceRoot: string, destRoot: string) {
  return copyUserContentSafely({
    sourceRoot,
    workspaceRoot: destRoot,
    startedAt: new Date().toISOString(),
  });
}

function hasImportableFile(sourceRoot: string, dir: string): boolean {
  if (!existsSync(dir)) return false;
  const info = lstatSync(dir);
  if (info.isSymbolicLink() || !info.isDirectory()) return false;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory() && hasImportableFile(sourceRoot, path)) return true;
    if (entry.isFile() && !EXCLUDED_FILES.has(relative(sourceRoot, path))) return true;
  }
  return false;
}

function realpathOrSelf(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}
