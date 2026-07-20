import { promises as fs } from 'node:fs';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import type { ChartDoc, IntradayBuilt, SepaBuilt } from '@kansoku/shared/types';
import { setEncBundlePresent, setProPresent } from '../src/pro/bundleState.js';
import { setLicenseManagerForTests, type LicenseManager } from '../src/license/licenseState.js';

const ctx = vi.hoisted(() => {
  const base = process.env.TMPDIR ?? '/tmp/';
  const sep = base.endsWith('/') ? '' : '/';
  const dir = `${base}${sep}charts-store-strip-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { dir };
});

vi.mock('../src/platform/env.js', () => ({ CHART_DATA_DIR: ctx.dir }));

const { loadChart } = await import('../src/charts/store.js');

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

function intradayBuilt(): IntradayBuilt {
  const tf = {
    candles: [],
    volumes: [],
    emas: [],
    macdDif: [],
    macdDea: [],
    macdHist: [],
    macdCrossMarkers: [],
    markers: [
      {
        time: 1,
        position: 'aboveBar' as const,
        color: '#fff',
        shape: 'circle' as const,
        text: 'ai',
        group: 'ai' as const,
      },
      {
        time: 1,
        position: 'aboveBar' as const,
        color: '#fff',
        shape: 'circle' as const,
        text: 'div',
        group: 'divergence' as const,
      },
    ],
    priceConnectors: [],
    macdConnectors: [],
    autoDivergence: [
      {
        kind: 'top' as const,
        a: { time: 1, price: 1, macd_value: 1 },
        b: { time: 2, price: 2, macd_value: 2 },
      },
    ],
    autoBeichi: [],
    pattern123: [],
    secondBreakouts: [],
  };
  return {
    kind: 'intraday',
    timeframes: { m5: tf, m15: tf, h1: tf },
    defaultTf: 'm5',
    entryPlan: null,
    sidebar: {
      symbol: 'NVDA.US',
      name: 'NVIDIA',
      asOf: '2026-07-21T00:00:00.000Z',
      last: 100,
      prediction: null,
      entryPlan: null,
      position: null,
      technicals: {
        m5: {
          last_dif: null,
          last_dea: null,
          last_hist: null,
          emas: [],
          recent_swing_highs: [],
          recent_swing_lows: [],
          last_cross: null,
          divergence_candidates: [],
          beichi_candidates: [],
        },
        m15: {
          last_dif: null,
          last_dea: null,
          last_hist: null,
          emas: [],
          recent_swing_highs: [],
          recent_swing_lows: [],
          last_cross: null,
          divergence_candidates: [],
          beichi_candidates: [],
        },
        h1: {
          last_dif: null,
          last_dea: null,
          last_hist: null,
          emas: [],
          recent_swing_highs: [],
          recent_swing_lows: [],
          last_cross: null,
          divergence_candidates: [],
          beichi_candidates: [],
        },
      },
      optionsLevels: {
        spot: 100,
        put_call_oi_ratio: 1,
        expiries: [],
        walls: [],
        updated_at: '2026-07-21T00:00:00.000Z',
      },
      news: [],
      context: null,
    },
  };
}

function docWith(built: ChartDoc['built'], id: string): ChartDoc {
  return {
    id,
    schema_version: 2,
    type: built.kind === 'sepa' ? 'sepa' : 'intraday',
    title: 'NVDA',
    symbol: 'NVDA.US',
    created_at: '2026-07-21T00:00:00.000Z',
    updated_at: '2026-07-21T00:00:00.000Z',
    input: { symbol: 'NVDA.US' },
    built,
  };
}

async function writeDoc(doc: ChartDoc): Promise<void> {
  await fs.mkdir(ctx.dir, { recursive: true });
  await fs.writeFile(`${ctx.dir}/${doc.id}.json`, JSON.stringify(doc));
}

afterEach(() => {
  setProPresent(false);
  setEncBundlePresent(false);
  setLicenseManagerForTests(null);
});

afterAll(async () => {
  await fs.rm(ctx.dir, { recursive: true, force: true });
});

describe('loadChart applies the pro-annotation strip at the serve boundary', () => {
  it('strips pattern/options data from a persisted doc when the feature is not active', async () => {
    const doc = docWith(intradayBuilt(), 'strip-inactive');
    await writeDoc(doc);

    const loaded = await loadChart('strip-inactive');
    expect(loaded).not.toBeNull();
    const built = loaded!.built as IntradayBuilt;
    expect(built.timeframes.m5.autoDivergence).toEqual([]);
    expect(built.timeframes.m5.markers.map((m) => m.group)).toEqual(['ai']);
    expect(built.sidebar.optionsLevels).toBeNull();
  });

  it('returns a persisted doc byte-identical (deep-equal) to what was written when both pro features are active', async () => {
    activatePro();
    const doc = docWith(intradayBuilt(), 'strip-active');
    await writeDoc(doc);

    const loaded = await loadChart('strip-active');
    expect(loaded).toEqual(doc);
  });

  it('passes non-intraday docs through unchanged regardless of feature state', async () => {
    const sepaBuilt: SepaBuilt = {
      kind: 'sepa',
      chart: {} as SepaBuilt['chart'],
      sidebar: {} as SepaBuilt['sidebar'],
    };
    const doc = docWith(sepaBuilt, 'strip-sepa');
    await writeDoc(doc);

    const loaded = await loadChart('strip-sepa');
    expect(loaded).toEqual(doc);
  });
});
