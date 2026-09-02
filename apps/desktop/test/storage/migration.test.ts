import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertWorkspaceAvailable, migrateLegacyStorage } from '@desktop/storage/migration.js';

const NOW = () => new Date('2026-09-02T00:00:00.000Z');

describe('migrateLegacyStorage', () => {
  let root = '';

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  function paths() {
    root = mkdtempSync(join(tmpdir(), 'kansoku-storage-migration-'));
    const userDataPath = join(root, 'userData');
    return {
      userDataPath,
      sourceRoot: join(root, 'legacy-project'),
      workspaceRoot: join(userDataPath, 'Workspace'),
      databasePath: join(userDataPath, 'State', 'app.db'),
    };
  }

  it('copies custom-root user content and creates a consistent database backup without deleting the source', async () => {
    const p = paths();
    await mkdir(join(p.sourceRoot, 'journal', 'charts', 'data'), { recursive: true });
    await mkdir(join(p.sourceRoot, 'stocks'), { recursive: true });
    await mkdir(p.userDataPath, { recursive: true });
    await writeFile(join(p.sourceRoot, 'journal', 'note.md'), 'legacy note');
    await writeFile(join(p.sourceRoot, 'stocks', 'NVDA.md'), 'legacy stock');
    await writeFile(join(p.userDataPath, 'data-root.json'), JSON.stringify({ path: p.sourceRoot }));

    const legacyDbPath = join(p.sourceRoot, 'journal', 'charts', 'data', 'app.db');
    const legacyDb = new DatabaseSync(legacyDbPath);
    legacyDb.exec('PRAGMA journal_mode = WAL; CREATE TABLE sample (value TEXT);');
    legacyDb.prepare('INSERT INTO sample VALUES (?)').run('from legacy WAL');
    legacyDb.close();

    const result = await migrateLegacyStorage({ ...p, now: NOW });

    expect(result.state.phase).toBe('complete');
    expect(readFileSync(join(p.workspaceRoot, 'journal', 'note.md'), 'utf8')).toBe('legacy note');
    expect(readFileSync(join(p.workspaceRoot, 'stocks', 'NVDA.md'), 'utf8')).toBe('legacy stock');
    expect(readFileSync(join(p.sourceRoot, 'journal', 'note.md'), 'utf8')).toBe('legacy note');
    expect(existsSync(join(p.userDataPath, 'data-root.json'))).toBe(false);

    const migratedDb = new DatabaseSync(p.databasePath, { readOnly: true });
    expect(migratedDb.prepare('SELECT value FROM sample').get()).toEqual({
      value: 'from legacy WAL',
    });
    migratedDb.close();
  });

  it('preserves both versions when a target file has different content', async () => {
    const p = paths();
    await mkdir(join(p.sourceRoot, 'journal'), { recursive: true });
    await mkdir(join(p.workspaceRoot, 'journal'), { recursive: true });
    await writeFile(join(p.sourceRoot, 'journal', 'same-name.md'), 'legacy');
    await writeFile(join(p.workspaceRoot, 'journal', 'same-name.md'), 'new workspace');

    const result = await migrateLegacyStorage({ ...p, sourceRootOverride: p.sourceRoot, now: NOW });
    const files = await readdir(join(p.workspaceRoot, 'journal'));
    const conflict = files.find((name) => name.startsWith('same-name.migration-conflict-'));

    expect(result.state.files.conflicts).toHaveLength(1);
    expect(readFileSync(join(p.workspaceRoot, 'journal', 'same-name.md'), 'utf8')).toBe(
      'new workspace',
    );
    expect(conflict).toBeDefined();
    expect(readFileSync(join(p.workspaceRoot, 'journal', conflict!), 'utf8')).toBe('legacy');
  });

  it('does not follow symlinks out of the legacy root', async () => {
    const p = paths();
    const outside = join(root, 'outside-secret.md');
    await mkdir(join(p.sourceRoot, 'journal'), { recursive: true });
    writeFileSync(outside, 'do not copy');
    symlinkSync(outside, join(p.sourceRoot, 'journal', 'linked.md'));

    const result = await migrateLegacyStorage({ ...p, sourceRootOverride: p.sourceRoot, now: NOW });

    expect(result.state.files.skippedSymlinks).toEqual([join('journal', 'linked.md')]);
    expect(existsSync(join(p.workspaceRoot, 'journal', 'linked.md'))).toBe(false);
  });

  it('does not follow a top-level journal symlink', async () => {
    const p = paths();
    const outside = join(root, 'outside-journal');
    await mkdir(outside, { recursive: true });
    await mkdir(p.sourceRoot, { recursive: true });
    await writeFile(join(outside, 'secret.md'), 'do not copy');
    symlinkSync(outside, join(p.sourceRoot, 'journal'));

    const result = await migrateLegacyStorage({ ...p, sourceRootOverride: p.sourceRoot, now: NOW });

    expect(result.state.files.skippedSymlinks).toEqual(['journal']);
    expect(existsSync(join(p.workspaceRoot, 'journal', 'secret.md'))).toBe(false);
  });

  it('blocks startup when the configured custom root is unavailable', async () => {
    const p = paths();
    await mkdir(p.userDataPath, { recursive: true });
    const missing = join(root, 'missing-project');
    await writeFile(join(p.userDataPath, 'data-root.json'), JSON.stringify({ path: missing }));

    await expect(migrateLegacyStorage({ ...p, now: NOW })).rejects.toMatchObject({
      code: 'source-unavailable',
      sourceRoot: missing,
    });
    expect(existsSync(p.databasePath)).toBe(false);
    expect(existsSync(join(p.userDataPath, 'data-root.json'))).toBe(true);
  });

  it('moves the legacy default layout into Workspace and is idempotent after completion', async () => {
    const p = paths();
    await mkdir(join(p.userDataPath, 'journal'), { recursive: true });
    await writeFile(join(p.userDataPath, 'journal', 'default.md'), 'default legacy');

    const first = await migrateLegacyStorage({ ...p, now: NOW });
    const second = await migrateLegacyStorage({ ...p, now: NOW });

    expect(first.state.phase).toBe('complete');
    expect(second.state).toEqual(first.state);
    expect(readFileSync(join(p.workspaceRoot, 'journal', 'default.md'), 'utf8')).toBe(
      'default legacy',
    );
    expect(
      (await readdir(join(p.workspaceRoot, 'journal'))).filter((name) => name.includes('conflict')),
    ).toHaveLength(0);
  });

  it('waits for the final workspace hook before completing and resumes from verified', async () => {
    const p = paths();
    await mkdir(join(p.sourceRoot, 'journal'), { recursive: true });
    await mkdir(p.userDataPath, { recursive: true });
    await writeFile(join(p.sourceRoot, 'journal', 'note.md'), 'legacy note');
    await writeFile(join(p.userDataPath, 'data-root.json'), JSON.stringify({ path: p.sourceRoot }));
    const beforeComplete = vi.fn().mockRejectedValueOnce(new Error('agent kit unavailable'));

    await expect(migrateLegacyStorage({ ...p, now: NOW, beforeComplete })).rejects.toThrow(
      'agent kit unavailable',
    );
    expect(
      JSON.parse(await readFile(join(p.userDataPath, 'State', 'storage-migration-v1.json'), 'utf8'))
        .phase,
    ).toBe('verified');
    expect(existsSync(join(p.userDataPath, 'data-root.json'))).toBe(true);

    const result = await migrateLegacyStorage({ ...p, now: NOW, beforeComplete });
    expect(result.state.phase).toBe('complete');
    expect(beforeComplete).toHaveBeenCalledTimes(2);
    expect(existsSync(join(p.userDataPath, 'data-root.json'))).toBe(false);
    expect(readFileSync(join(p.workspaceRoot, 'journal', 'note.md'), 'utf8')).toBe('legacy note');
  });

  it('keeps custom data primary while preserving conflicting default files and database', async () => {
    const p = paths();
    const defaultDbPath = join(p.userDataPath, 'journal', 'charts', 'data', 'app.db');
    const customDbPath = join(p.sourceRoot, 'journal', 'charts', 'data', 'app.db');
    await mkdir(join(p.userDataPath, 'journal', 'charts', 'data'), { recursive: true });
    await mkdir(join(p.sourceRoot, 'journal', 'charts', 'data'), { recursive: true });
    await writeFile(join(p.userDataPath, 'journal', 'shared.md'), 'default copy');
    await writeFile(join(p.sourceRoot, 'journal', 'shared.md'), 'custom copy');

    for (const [path, value] of [
      [defaultDbPath, 'default database'],
      [customDbPath, 'custom database'],
    ] as const) {
      const db = new DatabaseSync(path);
      db.exec('CREATE TABLE sample (value TEXT);');
      db.prepare('INSERT INTO sample VALUES (?)').run(value);
      db.close();
    }

    const result = await migrateLegacyStorage({
      ...p,
      sourceRootOverride: p.sourceRoot,
      now: NOW,
    });
    const workspaceFiles = await readdir(join(p.workspaceRoot, 'journal'));
    const conflict = workspaceFiles.find((name) => name.startsWith('shared.migration-conflict-'));

    expect(readFileSync(join(p.workspaceRoot, 'journal', 'shared.md'), 'utf8')).toBe('custom copy');
    expect(readFileSync(join(p.workspaceRoot, 'journal', conflict!), 'utf8')).toBe('default copy');
    expect(result.state.files.conflicts).toHaveLength(1);

    const migratedDb = new DatabaseSync(p.databasePath, { readOnly: true });
    expect(migratedDb.prepare('SELECT value FROM sample').get()).toEqual({
      value: 'custom database',
    });
    migratedDb.close();

    const backups = await readdir(join(p.userDataPath, 'State', 'backups'));
    const preservedDb = new DatabaseSync(join(p.userDataPath, 'State', 'backups', backups[0]), {
      readOnly: true,
    });
    expect(preservedDb.prepare('SELECT value FROM sample').get()).toEqual({
      value: 'default database',
    });
    preservedDb.close();
  });
});

describe('assertWorkspaceAvailable', () => {
  it('rejects a missing iCloud Workspace instead of creating an empty directory', async () => {
    const root = mkdtempSync(join(tmpdir(), 'kansoku-missing-icloud-'));
    try {
      const missing = join(root, 'Workspace');
      await expect(assertWorkspaceAvailable(missing)).rejects.toThrow();
      expect(existsSync(missing)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
