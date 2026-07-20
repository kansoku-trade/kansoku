import { promises as fs } from 'node:fs';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import type { ChartDoc, IntradayBuilt } from '@kansoku/shared/types';
import type { IntradayInput } from '../src/analysis/intraday/orchestrator.js';
import { setEncBundlePresent, setProPresent } from '../src/pro/bundleState.js';
import { setLicenseManagerForTests, type LicenseManager } from '../src/license/licenseState.js';

const ctx = vi.hoisted(() => {
  const base = process.env.TMPDIR ?? '/tmp/';
  const sep = base.endsWith('/') ? '' : '/';
  const dir = `${base}${sep}pro-walls-serve-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { dir };
});

vi.mock('../src/platform/env.js', async () => {
  const actual =
    await vi.importActual<typeof import('../src/platform/env.js')>('../src/platform/env.js');
  return { ...actual, CHART_DATA_DIR: ctx.dir };
});

// The chart index db is orthogonal to the options_levels serve boundary; stub it
// so the test never loads the native better-sqlite3 binding (ABI-pinned).
vi.mock('../src/db/index.js', () => {
  const insertChain = { values: () => ({ onConflictDoUpdate: () => Promise.resolve() }) };
  const db = {
    select: () => ({ from: () => Promise.resolve([{ count: 1 }]) }),
    insert: () => insertChain,
    delete: () => ({ where: () => Promise.resolve() }),
  };
  return { getDb: () => db, createDb: () => db };
});

const { chartsService } = await import('../src/charts/charts.service.js');
const { rebuild } = await import('../src/charts/build.js');
const { liveOptionsLevels } = await import('../src/realtime/charts.js');
const { loadFixture } = await import('./helpers.js');

function fakeLicenseManager(licensed: boolean): LicenseManager {
  return {
    getLicenseSnapshot: () => ({ state: licensed ? 'licensed' : 'unlicensed' }),
    getBundleKey: () => undefined,
    getBundleKeyId: () => undefined,
    activate: async () => ({ activated: true }),
    deactivate: async () => ({}) as never,
    revalidate: async () => {},
  };
}

function activatePro(): void {
  setProPresent(true);
  setLicenseManagerForTests(fakeLicenseManager(true));
}

const OPTIONS_LEVELS = {
  spot: 100,
  put_call_oi_ratio: 1,
  expiries: [],
  walls: [{ strike: 105, kind: 'call' as const, oi: 4200 }],
  updated_at: '2026-07-21T00:00:00.000Z',
};

async function writeIntradayDoc(id: string): Promise<ChartDoc> {
  const golden = loadFixture<IntradayInput>('intraday-input.json');
  const input = { ...golden, name: '英伟达' } as unknown as Record<string, unknown>;
  const { built, symbol } = rebuild('intraday', input, '英伟达');
  const intradayBuilt = built as IntradayBuilt;
  const persistedInput = { ...input, options_levels: OPTIONS_LEVELS };
  const doc: ChartDoc = {
    id,
    schema_version: 2,
    type: 'intraday',
    title: '英伟达',
    symbol: symbol ?? 'NVDA.US',
    created_at: '2026-07-21T00:00:00.000Z',
    updated_at: '2026-07-21T00:00:00.000Z',
    input: persistedInput,
    built: { ...intradayBuilt, sidebar: { ...intradayBuilt.sidebar, name: '英伟达' } },
  };
  await fs.mkdir(ctx.dir, { recursive: true });
  await fs.writeFile(`${ctx.dir}/${id}.json`, JSON.stringify(doc));
  return doc;
}

async function readPersistedInput(id: string): Promise<Record<string, unknown>> {
  const raw = JSON.parse(await fs.readFile(`${ctx.dir}/${id}.json`, 'utf8')) as ChartDoc;
  return raw.input;
}

afterEach(() => {
  setProPresent(false);
  setEncBundlePresent(false);
  setLicenseManagerForTests(null);
});

afterAll(async () => {
  await fs.rm(ctx.dir, { recursive: true, force: true });
});

describe('liveOptionsLevels — WS/rebuild fallback gating', () => {
  it('returns null (drops the stored fallback) when options-walls is inactive', () => {
    expect(liveOptionsLevels(null, { options_levels: OPTIONS_LEVELS })).toBeNull();
  });

  it('preserves the stored fallback when options-walls is active', () => {
    activatePro();
    expect(liveOptionsLevels(null, { options_levels: OPTIONS_LEVELS })).toEqual(OPTIONS_LEVELS);
  });

  it('always uses a freshly fetched value regardless of feature state', () => {
    const fresh = { ...OPTIONS_LEVELS, spot: 200 };
    expect(liveOptionsLevels(fresh, { options_levels: OPTIONS_LEVELS })).toEqual(fresh);
  });
});

describe('chartsService.get / update — options_levels serve boundary', () => {
  it('nulls input.options_levels in the served doc when the feature is inactive, leaving disk intact', async () => {
    await writeIntradayDoc('walls-get-inactive');

    const served = await chartsService.get({ id: 'walls-get-inactive' });
    expect((served.input as Record<string, unknown>).options_levels).toBeNull();

    const onDisk = await readPersistedInput('walls-get-inactive');
    expect(onDisk.options_levels).toEqual(OPTIONS_LEVELS);
  });

  it('serves input.options_levels intact when the feature is active', async () => {
    activatePro();
    await writeIntradayDoc('walls-get-active');

    const served = await chartsService.get({ id: 'walls-get-active' });
    expect((served.input as Record<string, unknown>).options_levels).toEqual(OPTIONS_LEVELS);
  });

  it('a free-side PATCH cannot erase stored options_levels', async () => {
    await writeIntradayDoc('walls-update-inactive');

    await chartsService.update({ id: 'walls-update-inactive', position: null });

    const onDisk = await readPersistedInput('walls-update-inactive');
    expect(onDisk.options_levels).toEqual(OPTIONS_LEVELS);
  });
});
