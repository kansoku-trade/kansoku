import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { importUserContent, validateImportSource } from '@desktop/data/dataImport/manifest.js';

describe('Kansoku user-content import', () => {
  let root: string;
  let source: string;
  let dest: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'kansoku-data-import-'));
    source = join(root, 'source');
    dest = join(root, 'dest');
    mkdirSync(source, { recursive: true });
    mkdirSync(dest, { recursive: true });
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('accepts journal or stocks content and rejects an empty or unrelated directory', () => {
    mkdirSync(join(source, 'stocks'), { recursive: true });
    writeFileSync(join(source, 'stocks', 'NVDA.md'), 'note');
    expect(validateImportSource(source, dest)).toEqual({ ok: true });

    const empty = join(root, 'empty');
    mkdirSync(join(empty, 'journal'), { recursive: true });
    expect(validateImportSource(empty, dest)).toEqual({ ok: false, reason: 'empty' });

    const unrelated = join(root, 'unrelated');
    mkdirSync(unrelated, { recursive: true });
    expect(validateImportSource(unrelated, dest)).toEqual({
      ok: false,
      reason: 'missing-content',
    });
  });

  it('does not treat the SQLite files as importable user content', () => {
    mkdirSync(join(source, 'journal', 'charts', 'data'), { recursive: true });
    writeFileSync(join(source, 'journal', 'charts', 'data', 'app.db'), 'db');
    writeFileSync(join(source, 'journal', 'charts', 'data', 'app.db-wal'), 'wal');

    expect(validateImportSource(source, dest)).toEqual({ ok: false, reason: 'empty' });
  });

  it('copies all user content while preserving a different target as a conflict copy', async () => {
    mkdirSync(join(source, 'journal', 'charts', 'data'), { recursive: true });
    mkdirSync(join(source, 'stocks'), { recursive: true });
    mkdirSync(join(dest, 'stocks'), { recursive: true });
    writeFileSync(join(source, 'journal', 'daily.md'), 'daily');
    writeFileSync(join(source, 'journal', 'charts', 'data', 'chart.json'), '{}');
    writeFileSync(join(source, 'journal', 'charts', 'data', 'app.db'), 'never import');
    writeFileSync(join(source, 'stocks', 'NVDA.md'), 'source');
    writeFileSync(join(dest, 'stocks', 'NVDA.md'), 'destination');

    const result = await importUserContent(source, dest);

    expect(readFileSync(join(dest, 'journal', 'daily.md'), 'utf8')).toBe('daily');
    expect(readFileSync(join(dest, 'journal', 'charts', 'data', 'chart.json'), 'utf8')).toBe('{}');
    expect(existsSync(join(dest, 'journal', 'charts', 'data', 'app.db'))).toBe(false);
    expect(readFileSync(join(dest, 'stocks', 'NVDA.md'), 'utf8')).toBe('destination');
    expect(result.conflicts).toHaveLength(1);
    expect(existsSync(join(dest, result.conflicts[0]))).toBe(true);
  });

  it('refuses to import the Workspace onto itself', () => {
    mkdirSync(join(source, 'journal'), { recursive: true });
    writeFileSync(join(source, 'journal', 'daily.md'), 'daily');
    expect(validateImportSource(source, source)).toEqual({ ok: false, reason: 'self' });
  });
});
