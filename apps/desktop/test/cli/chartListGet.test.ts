import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

const here = fileURLToPath(new URL('.', import.meta.url));
const migrationsDir = join(here, '..', '..', '..', '..', 'packages', 'core', 'drizzle');

const originalTradeProjectRoot = process.env.TRADE_PROJECT_ROOT;
const originalMigrationsDir = process.env.TRADE_MIGRATIONS_DIR;

const tmpRoot = mkdtempSync(join(tmpdir(), 'kansoku-cli-chart-listget-'));
process.env.TRADE_PROJECT_ROOT = tmpRoot;
process.env.TRADE_MIGRATIONS_DIR = migrationsDir;

const { runChartList } = await import('@desktop/cli/commands/chart/list.js');
const { runChartGet } = await import('@desktop/cli/commands/chart/get.js');
const { getDb } = await import('@kansoku/core/db/index');
const { chartMeta } = await import('@kansoku/core/db/schema');

function seedMeta(id: string, symbol: string, type: string, createdAt: string) {
  const db = getDb();
  return db.insert(chartMeta).values({
    id,
    schemaVersion: 1,
    type,
    title: id,
    symbol,
    createdAt,
    updatedAt: createdAt,
    predictionUpdatedAt: null,
  });
}

function writeChartJson(id: string, doc: Record<string, unknown>) {
  const dir = join(tmpRoot, 'journal', 'charts', 'data');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}.json`), JSON.stringify(doc), 'utf8');
}

describe('runChartList / runChartGet (real sqlite)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    if (originalTradeProjectRoot === undefined) delete process.env.TRADE_PROJECT_ROOT;
    else process.env.TRADE_PROJECT_ROOT = originalTradeProjectRoot;
    if (originalMigrationsDir === undefined) delete process.env.TRADE_MIGRATIONS_DIR;
    else process.env.TRADE_MIGRATIONS_DIR = originalMigrationsDir;
  });

  it('lists all chart_meta rows newest first when unfiltered', async () => {
    await seedMeta('2026-07-20-mu-sepa', 'MU.US', 'sepa', '2026-07-20T14:00:00.000Z');
    await seedMeta('2026-07-21-nvda-intraday', 'NVDA.US', 'intraday', '2026-07-21T14:00:00.000Z');

    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runChartList([]);

    const emitted = JSON.parse((write.mock.calls[0] as [string])[0]);
    expect(emitted.map((r: { id: string }) => r.id)).toEqual([
      '2026-07-21-nvda-intraday',
      '2026-07-20-mu-sepa',
    ]);
  });

  it('filters by --symbol, normalizing a bare ticker to its .US form', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runChartList(['--symbol', 'MU']);

    const emitted = JSON.parse((write.mock.calls[0] as [string])[0]);
    expect(emitted.map((r: { id: string }) => r.id)).toEqual(['2026-07-20-mu-sepa']);
  });

  it('filters by --date against the createdAt eastern-date derivation', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runChartList(['--date', '2026-07-20']);

    const emitted = JSON.parse((write.mock.calls[0] as [string])[0]);
    expect(emitted.map((r: { id: string }) => r.id)).toEqual(['2026-07-20-mu-sepa']);
  });

  it('get returns {meta, data} for a chart that has both a row and a json file', async () => {
    writeChartJson('2026-07-20-mu-sepa', {
      id: '2026-07-20-mu-sepa',
      type: 'sepa',
      built: { kind: 'sepa' },
      hello: 'world',
    });

    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runChartGet(['2026-07-20-mu-sepa']);

    const emitted = JSON.parse((write.mock.calls[0] as [string])[0]);
    expect(emitted.meta.id).toBe('2026-07-20-mu-sepa');
    expect(emitted.data.hello).toBe('world');
  });

  it('get exits 1 with stderr when the id has no chart_meta row', async () => {
    const errWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    await runChartGet(['does-not-exist']);

    expect(errWrite).toHaveBeenCalledWith(expect.stringContaining('not found'));
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('get exits 1 with stderr when the row exists but the json file is missing', async () => {
    await seedMeta('2026-07-22-orphan-sepa', 'ORPHAN.US', 'sepa', '2026-07-22T14:00:00.000Z');
    const errWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    await runChartGet(['2026-07-22-orphan-sepa']);

    expect(errWrite).toHaveBeenCalledWith(expect.stringContaining('missing chart data'));
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('get exits 64 with stderr when no id is given', async () => {
    const errWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    await runChartGet([]);

    expect(errWrite).toHaveBeenCalledWith(expect.stringContaining('missing chart id'));
    expect(exit).toHaveBeenCalledWith(64);
  });
});
