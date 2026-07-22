import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

const providerStub = vi.hoisted(() => ({
  name: 'us',
  capabilities: new Set<string>(),
  getNews: vi.fn().mockResolvedValue([]),
}));

vi.mock('@kansoku/core/marketdata/registry', () => ({
  getProvider: () => providerStub,
}));

const here = fileURLToPath(new URL('.', import.meta.url));
const migrationsDir = join(here, '..', '..', '..', '..', 'packages', 'core', 'drizzle');

const originalTradeProjectRoot = process.env.TRADE_PROJECT_ROOT;
const originalMigrationsDir = process.env.TRADE_MIGRATIONS_DIR;

const tmpRoot = mkdtempSync(join(tmpdir(), 'kansoku-cli-chart-'));
process.env.TRADE_PROJECT_ROOT = tmpRoot;
process.env.TRADE_MIGRATIONS_DIR = migrationsDir;

const { runChartCreate } = await import('@desktop/cli/commands/chart/create.js');
const { getDb } = await import('@kansoku/core/db/index');
const { chartMeta } = await import('@kansoku/core/db/schema');

function bar(time: string, price: number) {
  return { time, open: price, high: price, low: price, close: price, volume: 1000 };
}

function sepaKline(days: number): ReturnType<typeof bar>[] {
  const bars: ReturnType<typeof bar>[] = [];
  let price = 100;
  let t = Date.parse('2026-01-05T00:00:00Z');
  for (let i = 0; i < days; i++) {
    price += i % 3 === 0 ? 0.4 : -0.1;
    bars.push(bar(new Date(t).toISOString(), price));
    t += 86_400_000;
  }
  return bars;
}

function mockStdin(content: string): void {
  Object.defineProperty(process, 'stdin', {
    value: (async function* () {
      yield Buffer.from(content, 'utf8');
    })(),
    configurable: true,
  });
}

describe('runChartCreate (real sqlite + fixture data, no network)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    if (originalTradeProjectRoot === undefined) delete process.env.TRADE_PROJECT_ROOT;
    else process.env.TRADE_PROJECT_ROOT = originalTradeProjectRoot;
    if (originalMigrationsDir === undefined) delete process.env.TRADE_MIGRATIONS_DIR;
    else process.env.TRADE_MIGRATIONS_DIR = originalMigrationsDir;
  });

  it('creates a cohort chart, writes chart_meta + json, and emits {id, url, ...}', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    mockStdin(
      JSON.stringify({
        title: 'CLI cohort test',
        data: [
          { symbol: 'MU', value: -17087 },
          { symbol: 'NVDA', value: 9540 },
        ],
      }),
    );

    await runChartCreate(['--type', 'cohort', '--json-input', '-']);

    expect(write).toHaveBeenCalledTimes(1);
    const emitted = JSON.parse((write.mock.calls[0] as [string])[0]);
    expect(emitted.id).toBeTruthy();
    expect(typeof emitted.url).toBe('string');
    expect(emitted.deepLink).toMatch(/^kansoku:\/\/route\//);

    const db = getDb();
    const rows = await db.select().from(chartMeta);
    const row = rows.find((r) => r.id === emitted.id);
    expect(row?.type).toBe('cohort');

    const dataPath = join(tmpRoot, 'journal', 'charts', 'data', `${emitted.id}.json`);
    expect(existsSync(dataPath)).toBe(true);
    const persisted = JSON.parse(readFileSync(dataPath, 'utf8'));
    expect(persisted.id).toBe(emitted.id);
  });

  it('creates a sepa chart from an explicit kline fixture (no provider hit) via stdin', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    mockStdin(
      JSON.stringify({
        name: 'Test Co',
        skip_spy: true,
        kline: sepaKline(90),
      }),
    );

    await runChartCreate(['--type', 'sepa', '--symbol', 'MU.US', '--json-input', '-']);

    expect(write).toHaveBeenCalledTimes(1);
    const emitted = JSON.parse((write.mock.calls[0] as [string])[0]);
    expect(emitted.id).toBeTruthy();
    expect(emitted.symbol).toBe('MU.US');
    expect(emitted.deepLink).toBe(`kansoku://route/symbol/MU.US?analysis=${emitted.id}`);
    expect(providerStub.getNews).toHaveBeenCalledWith('MU.US');
  });

  it('reads the payload from --json-input <path> instead of stdin', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const payloadPath = join(tmpRoot, 'cohort-payload.json');
    writeFileSync(
      payloadPath,
      JSON.stringify({ data: [{ symbol: 'AMD', value: 100 }] }),
      'utf8',
    );

    await runChartCreate(['--type', 'cohort', '--json-input', payloadPath]);

    expect(write).toHaveBeenCalledTimes(1);
    const emitted = JSON.parse((write.mock.calls[0] as [string])[0]);
    expect(emitted.id).toBeTruthy();
    expect(emitted.deepLink).toMatch(/^kansoku:\/\/route\//);
  });

  it('exits 64 with a stderr message when a required field (symbol) is missing', async () => {
    const errWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    mockStdin(JSON.stringify({ skip_spy: true, kline: [bar('2026-07-20T00:00:00Z', 100)] }));

    await runChartCreate(['--type', 'sepa', '--json-input', '-']);

    expect(exit).toHaveBeenCalledWith(64);
    expect(errWrite).toHaveBeenCalled();
    expect(String(errWrite.mock.calls.at(-1)?.[0])).toContain('symbol');
  });

  it('exits 64 when --type is missing', async () => {
    const errWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    await runChartCreate(['--json-input', '-']);

    expect(exit).toHaveBeenCalledWith(64);
    expect(errWrite).toHaveBeenCalledWith(expect.stringContaining('--type is required'));
  });

  it('exits 64 when --json-input is missing', async () => {
    const errWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    await runChartCreate(['--type', 'cohort']);

    expect(exit).toHaveBeenCalledWith(64);
    expect(errWrite).toHaveBeenCalledWith(expect.stringContaining('--json-input is required'));
  });
});
