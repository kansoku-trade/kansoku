import { createHash, randomUUID } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import {
  access,
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';

const LEGACY_DB_REL = join('journal', 'charts', 'data', 'app.db');
const USER_CONTENT_DIRS = ['journal', 'stocks'] as const;

export type StorageMigrationPhase =
  'detected' | 'files-copied' | 'database-backed-up' | 'verified' | 'complete';

export interface StorageMigrationState {
  version: 1;
  sourceRoot: string;
  workspaceRoot: string;
  databasePath: string;
  phase: StorageMigrationPhase;
  startedAt: string;
  updatedAt: string;
  files: {
    copied: number;
    identical: number;
    conflicts: string[];
    skippedSymlinks: string[];
    failed: Array<{ path: string; error: string }>;
  };
}

export type StorageMigrationErrorCode =
  'source-unavailable' | 'file-copy-failed' | 'database-invalid';

export class StorageMigrationError extends Error {
  constructor(
    readonly code: StorageMigrationErrorCode,
    message: string,
    readonly sourceRoot: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'StorageMigrationError';
  }
}

export interface StorageMigrationInput {
  userDataPath: string;
  workspaceRoot: string;
  databasePath: string;
  sourceRootOverride?: string;
  beforeComplete?: () => Promise<void>;
  now?: () => Date;
}

export interface StorageMigrationResult {
  state: StorageMigrationState;
  legacyPreferencePath: string;
  performed: boolean;
}

export async function migrateLegacyStorage(
  input: StorageMigrationInput,
): Promise<StorageMigrationResult> {
  const now = input.now ?? (() => new Date());
  const statePath = join(dirname(input.databasePath), 'storage-migration-v1.json');
  const legacyPreferencePath = join(input.userDataPath, 'data-root.json');
  const existing = await readMigrationState(statePath);

  if (existing?.phase === 'complete') {
    await removeLegacyPreference(legacyPreferencePath);
    return { state: existing, legacyPreferencePath, performed: false };
  }
  if (
    existing?.phase === 'verified' &&
    existing.workspaceRoot === input.workspaceRoot &&
    existing.databasePath === input.databasePath
  ) {
    await input.beforeComplete?.();
    const state = { ...existing, phase: 'complete' as const, updatedAt: now().toISOString() };
    await writeMigrationState(statePath, state);
    await removeLegacyPreference(legacyPreferencePath);
    return { state, legacyPreferencePath, performed: true };
  }

  const configuredSource =
    input.sourceRootOverride ?? (await readLegacyConfiguredPath(legacyPreferencePath));
  const sourceRoot = configuredSource ?? input.userDataPath;
  await assertSourceAvailable(sourceRoot);

  const startedAt =
    existing?.sourceRoot === sourceRoot && existing.workspaceRoot === input.workspaceRoot
      ? existing.startedAt
      : now().toISOString();
  let state: StorageMigrationState = {
    version: 1,
    sourceRoot,
    workspaceRoot: input.workspaceRoot,
    databasePath: input.databasePath,
    phase: 'detected',
    startedAt,
    updatedAt: now().toISOString(),
    files: emptyFileResult(),
  };

  await mkdir(dirname(statePath), { recursive: true });
  await writeMigrationState(statePath, state);
  await scaffoldWorkspace(input.workspaceRoot);

  let files = await copyUserContentSafely({
    sourceRoot,
    workspaceRoot: input.workspaceRoot,
    startedAt,
  });
  if (!(await samePath(sourceRoot, input.userDataPath))) {
    files = mergeFileResults(
      files,
      await copyUserContentSafely({
        sourceRoot: input.userDataPath,
        workspaceRoot: input.workspaceRoot,
        startedAt,
      }),
    );
  }
  state = { ...state, phase: 'files-copied', updatedAt: now().toISOString(), files };
  await writeMigrationState(statePath, state);

  if (files.failed.length > 0) {
    throw new StorageMigrationError(
      'file-copy-failed',
      `有 ${files.failed.length} 个用户文件复制失败`,
      sourceRoot,
    );
  }

  try {
    const customDatabasePath = join(sourceRoot, LEGACY_DB_REL);
    const defaultDatabasePath = join(input.userDataPath, LEGACY_DB_REL);
    if (
      !(await samePath(sourceRoot, input.userDataPath)) &&
      (await pathExists(customDatabasePath)) &&
      (await pathExists(defaultDatabasePath))
    ) {
      await preserveLegacyDatabase({
        sourcePath: defaultDatabasePath,
        databasePath: input.databasePath,
        startedAt,
      });
    }
    await migrateDatabase({
      sourcePath:
        (await pathExists(customDatabasePath)) || (await samePath(sourceRoot, input.userDataPath))
          ? customDatabasePath
          : defaultDatabasePath,
      targetPath: input.databasePath,
      startedAt,
    });
  } catch (error) {
    throw new StorageMigrationError(
      'database-invalid',
      `数据库迁移失败：${error instanceof Error ? error.message : String(error)}`,
      sourceRoot,
      { cause: error },
    );
  }

  state = { ...state, phase: 'database-backed-up', updatedAt: now().toISOString() };
  await writeMigrationState(statePath, state);
  await assertDatabaseIntegrity(input.databasePath);

  state = { ...state, phase: 'verified', updatedAt: now().toISOString() };
  await writeMigrationState(statePath, state);
  await input.beforeComplete?.();
  state = { ...state, phase: 'complete', updatedAt: now().toISOString() };
  await writeMigrationState(statePath, state);
  await removeLegacyPreference(legacyPreferencePath);
  return { state, legacyPreferencePath, performed: true };
}

export async function initializeEmptyWorkspace(input: {
  workspaceRoot: string;
  databasePath: string;
}): Promise<void> {
  await scaffoldWorkspace(input.workspaceRoot);
  await mkdir(dirname(input.databasePath), { recursive: true });
}

export async function assertWorkspaceAvailable(path: string): Promise<void> {
  const info = await stat(path);
  if (!info.isDirectory()) throw new Error(`Agent Workspace 不是目录：${path}`);
  await access(path, constants.R_OK | constants.W_OK);
}

export async function readMigrationState(path: string): Promise<StorageMigrationState | null> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Partial<StorageMigrationState>;
    if (
      parsed.version !== 1 ||
      typeof parsed.sourceRoot !== 'string' ||
      typeof parsed.workspaceRoot !== 'string' ||
      typeof parsed.databasePath !== 'string' ||
      !isPhase(parsed.phase) ||
      typeof parsed.startedAt !== 'string' ||
      typeof parsed.updatedAt !== 'string' ||
      !parsed.files
    ) {
      return null;
    }
    return parsed as StorageMigrationState;
  } catch {
    return null;
  }
}

async function readLegacyConfiguredPath(path: string): Promise<string | null> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as { path?: unknown };
    return typeof parsed.path === 'string' && parsed.path.length > 0 ? parsed.path : null;
  } catch {
    return null;
  }
}

async function assertSourceAvailable(sourceRoot: string): Promise<void> {
  try {
    const info = await stat(sourceRoot);
    if (!info.isDirectory()) throw new Error('不是目录');
    await access(sourceRoot);
  } catch (error) {
    throw new StorageMigrationError(
      'source-unavailable',
      `旧数据目录不可访问：${sourceRoot}`,
      sourceRoot,
      { cause: error },
    );
  }
}

async function scaffoldWorkspace(workspaceRoot: string): Promise<void> {
  await Promise.all([
    mkdir(join(workspaceRoot, 'journal', 'charts', 'data'), { recursive: true }),
    mkdir(join(workspaceRoot, 'journal', 'charts', 'annotations'), { recursive: true }),
    mkdir(join(workspaceRoot, 'journal', 'canvases'), { recursive: true }),
    mkdir(join(workspaceRoot, 'stocks'), { recursive: true }),
  ]);
}

export async function copyUserContentSafely(input: {
  sourceRoot: string;
  workspaceRoot: string;
  startedAt: string;
}): Promise<StorageMigrationState['files']> {
  const result = emptyFileResult();
  if (await samePath(input.sourceRoot, input.workspaceRoot)) return result;

  for (const topLevel of USER_CONTENT_DIRS) {
    const source = join(input.sourceRoot, topLevel);
    if (!(await pathExists(source))) continue;
    const sourceInfo = await lstat(source);
    if (sourceInfo.isSymbolicLink()) {
      result.skippedSymlinks.push(topLevel);
      continue;
    }
    if (!sourceInfo.isDirectory()) continue;
    await copyTree(source, join(input.workspaceRoot, topLevel), input, result);
  }
  return result;
}

async function copyTree(
  sourceDir: string,
  targetDir: string,
  input: { sourceRoot: string; workspaceRoot: string; startedAt: string },
  result: StorageMigrationState['files'],
): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = join(sourceDir, entry.name);
    const targetPath = join(targetDir, entry.name);
    const relPath = relative(input.sourceRoot, sourcePath);
    if (
      relPath === LEGACY_DB_REL ||
      relPath === `${LEGACY_DB_REL}-wal` ||
      relPath === `${LEGACY_DB_REL}-shm`
    ) {
      continue;
    }
    if (entry.isSymbolicLink()) {
      result.skippedSymlinks.push(relPath);
      continue;
    }
    if (entry.isDirectory()) {
      await copyTree(sourcePath, targetPath, input, result);
      continue;
    }
    if (!entry.isFile()) continue;
    try {
      await copyOneFile(sourcePath, targetPath, relPath, input.startedAt, result);
    } catch (error) {
      result.failed.push({
        path: relPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

async function copyOneFile(
  sourcePath: string,
  targetPath: string,
  relPath: string,
  startedAt: string,
  result: StorageMigrationState['files'],
): Promise<void> {
  const sourceHash = await sha256File(sourcePath);
  if (!(await pathExists(targetPath))) {
    await copyAtomic(sourcePath, targetPath);
    result.copied++;
    return;
  }
  if ((await sha256File(targetPath)) === sourceHash) {
    result.identical++;
    return;
  }

  const conflictPath = buildConflictPath(targetPath, startedAt, sourceHash);
  if (!(await pathExists(conflictPath))) {
    await copyAtomic(sourcePath, conflictPath);
    result.copied++;
  } else if ((await sha256File(conflictPath)) !== sourceHash) {
    throw new Error(`冲突副本已存在但内容不一致：${conflictPath}`);
  }
  result.conflicts.push(relative(inputRoot(targetPath, relPath), conflictPath));
}

// Reconstructs the target root without trusting a source path or following links.
function inputRoot(targetPath: string, relPath: string): string {
  let root = targetPath;
  for (const _part of relPath.split(/[\\/]/)) root = dirname(root);
  return root;
}

function buildConflictPath(targetPath: string, startedAt: string, sourceHash: string): string {
  const extension = extname(targetPath);
  const stem = basename(targetPath, extension);
  const timestamp = startedAt.replaceAll(/[-:.]/g, '').replace('T', '-').replace('Z', 'Z');
  return join(
    dirname(targetPath),
    `${stem}.migration-conflict-${timestamp}-${sourceHash.slice(0, 8)}${extension}`,
  );
}

async function copyAtomic(sourcePath: string, targetPath: string): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.migration-${randomUUID()}.tmp`;
  try {
    await copyFile(sourcePath, tempPath);
    await rename(tempPath, targetPath);
  } finally {
    await rm(tempPath, { force: true });
  }
}

async function migrateDatabase(input: {
  sourcePath: string;
  targetPath: string;
  startedAt: string;
}): Promise<void> {
  await mkdir(dirname(input.targetPath), { recursive: true });

  if (!(await pathExists(input.sourcePath))) {
    if (!(await pathExists(input.targetPath))) {
      const empty = new DatabaseSync(input.targetPath);
      empty.close();
    }
    await assertDatabaseIntegrity(input.targetPath);
    return;
  }

  if (await samePath(input.sourcePath, input.targetPath)) {
    await assertDatabaseIntegrity(input.targetPath);
    return;
  }

  if (await pathExists(input.targetPath)) {
    const backupDir = join(dirname(input.targetPath), 'backups');
    await mkdir(backupDir, { recursive: true });
    const backupPath = join(backupDir, `app-before-migration-${safeTimestamp(input.startedAt)}.db`);
    await backupSqlite(input.targetPath, backupPath);
  }

  const tempPath = `${input.targetPath}.migration-${randomUUID()}.tmp`;
  try {
    await backupSqlite(input.sourcePath, tempPath);
    await assertDatabaseIntegrity(tempPath);
    await rm(`${input.targetPath}-wal`, { force: true });
    await rm(`${input.targetPath}-shm`, { force: true });
    await rename(tempPath, input.targetPath);
  } finally {
    await rm(tempPath, { force: true });
  }
}

async function preserveLegacyDatabase(input: {
  sourcePath: string;
  databasePath: string;
  startedAt: string;
}): Promise<void> {
  const backupPath = join(
    dirname(input.databasePath),
    'backups',
    `app-legacy-default-${safeTimestamp(input.startedAt)}.db`,
  );
  if (await pathExists(backupPath)) {
    await assertDatabaseIntegrity(backupPath);
    return;
  }
  await mkdir(dirname(backupPath), { recursive: true });
  await backupSqlite(input.sourcePath, backupPath);
  await assertDatabaseIntegrity(backupPath);
}

async function backupSqlite(sourcePath: string, targetPath: string): Promise<void> {
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  try {
    await backup(source, targetPath);
  } finally {
    source.close();
  }
}

async function assertDatabaseIntegrity(path: string): Promise<void> {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const row = db.prepare('PRAGMA integrity_check').get() as Record<string, unknown> | undefined;
    if (!row || !Object.values(row).includes('ok')) {
      throw new Error(`PRAGMA integrity_check 未返回 ok：${JSON.stringify(row)}`);
    }
  } finally {
    db.close();
  }
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function writeMigrationState(path: string, state: StorageMigrationState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    await chmod(tempPath, 0o600);
    await rename(tempPath, path);
  } finally {
    await rm(tempPath, { force: true });
  }
}

async function removeLegacyPreference(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

async function samePath(a: string, b: string): Promise<boolean> {
  try {
    return (await realpath(a)) === (await realpath(b));
  } catch {
    return resolve(a) === resolve(b);
  }
}

function emptyFileResult(): StorageMigrationState['files'] {
  return { copied: 0, identical: 0, conflicts: [], skippedSymlinks: [], failed: [] };
}

function mergeFileResults(
  first: StorageMigrationState['files'],
  second: StorageMigrationState['files'],
): StorageMigrationState['files'] {
  return {
    copied: first.copied + second.copied,
    identical: first.identical + second.identical,
    conflicts: [...first.conflicts, ...second.conflicts],
    skippedSymlinks: [...first.skippedSymlinks, ...second.skippedSymlinks],
    failed: [...first.failed, ...second.failed],
  };
}

function isPhase(value: unknown): value is StorageMigrationPhase {
  return (
    value === 'detected' ||
    value === 'files-copied' ||
    value === 'database-backed-up' ||
    value === 'verified' ||
    value === 'complete'
  );
}

function safeTimestamp(value: string): string {
  return value.replaceAll(/[-:.]/g, '').replace('T', '-');
}
