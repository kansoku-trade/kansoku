import { afterEach, describe, expect, it } from 'vitest';
import type {
  Connector,
  IntradayBuilt,
  IntradayTfData,
  IntradayTfSummary,
  SeriesMarker,
} from '@kansoku/shared/types';
import { stripProAnnotations } from '../src/pro/stripProAnnotations.js';
import { setEncBundlePresent, setProPresent } from '../src/pro/bundleState.js';
import { setLicenseManagerForTests, type LicenseManager } from '../src/license/licenseState.js';

function fakeLicenseManager(licensed: boolean): LicenseManager {
  return {
    getLicenseSnapshot: () => ({ state: licensed ? 'licensed' : 'unlicensed' }),
    getBundleKey: () => undefined,
    activate: async () => ({ activated: true }),
    deactivate: async () => ({}) as never,
    revalidate: async () => {},
  };
}

function activatePro(): void {
  setProPresent(true);
  setLicenseManagerForTests(fakeLicenseManager(true));
}

afterEach(() => {
  setProPresent(false);
  setEncBundlePresent(false);
  setLicenseManagerForTests(null);
});

function marker(overrides: Partial<SeriesMarker> = {}): SeriesMarker {
  return {
    time: 1,
    position: 'aboveBar',
    color: '#fff',
    shape: 'circle',
    text: 'x',
    ...overrides,
  };
}

function connector(overrides: Partial<Connector> = {}): Connector {
  return { color: '#fff', data: [{ time: 1, value: 1 }], ...overrides };
}

function summary(overrides: Partial<IntradayTfSummary> = {}): IntradayTfSummary {
  return {
    last_dif: null,
    last_dea: null,
    last_hist: null,
    emas: [],
    recent_swing_highs: [],
    recent_swing_lows: [],
    last_cross: null,
    divergence_candidates: [
      {
        kind: 'top',
        a: { time: 1, price: 1, macd_value: 1 },
        b: { time: 2, price: 2, macd_value: 2 },
      },
    ],
    beichi_candidates: [
      {
        kind: 'bottom',
        a: { time: 1, price: 1, macd_value: 1 },
        b: { time: 2, price: 2, macd_value: 2 },
      },
    ],
    candle_patterns: [
      { kind: 'hammer', time: 1, price: 1, bias: 'bullish', label: 'l', implication: 'i' },
    ],
    pattern_123: [
      {
        kind: 'bullish',
        status: 'confirmed',
        p1: { time: 1, price: 1 },
        p2: { time: 2, price: 2 },
        p3: { time: 3, price: 3 },
        trigger: 1,
        invalidation: 1,
        confirm: null,
        label: 'l',
        implication: 'i',
      },
    ],
    second_breakouts: [
      {
        kind: 'H2',
        status: 'confirmed',
        first: { time: 1, price: 1 },
        signal: { time: 2, price: 2 },
        trigger: null,
      },
    ],
    ...overrides,
  };
}

function tfData(overrides: Partial<IntradayTfData> = {}): IntradayTfData {
  return {
    candles: [],
    volumes: [],
    emas: [],
    macdDif: [],
    macdDea: [],
    macdHist: [],
    macdCrossMarkers: [marker({ id: 'cross-1' })],
    markers: [
      marker({ id: 'ai-1', group: 'ai' }),
      marker({ id: 'div-1', group: 'divergence' }),
      marker({ id: 'beichi-1', group: 'macdBeichi' }),
      marker({ id: 'p123-1', group: 'pattern123' }),
      marker({ id: 'candle-1', group: 'candle' }),
      marker({ id: 'plain-1' }),
    ],
    priceConnectors: [
      connector({ group: 'divergence' }),
      connector({ group: 'ai' }),
      connector({ group: 'pattern123', recent: false }),
    ],
    macdConnectors: [connector({ group: 'macdBeichi' }), connector({ group: 'candle' })],
    autoDivergence: [
      {
        kind: 'top',
        a: { time: 1, price: 1, macd_value: 1 },
        b: { time: 2, price: 2, macd_value: 2 },
      },
    ],
    autoBeichi: [
      {
        kind: 'bottom',
        a: { time: 1, price: 1, macd_value: 1 },
        b: { time: 2, price: 2, macd_value: 2 },
      },
    ],
    pattern123: [
      {
        kind: 'bearish',
        status: 'forming',
        p1: { time: 1, price: 1 },
        p2: { time: 2, price: 2 },
        p3: { time: 3, price: 3 },
        trigger: 1,
        invalidation: 1,
        confirm: null,
        label: 'l',
        implication: 'i',
      },
    ],
    secondBreakouts: [
      {
        kind: 'L2',
        status: 'forming',
        first: { time: 1, price: 1 },
        signal: { time: 2, price: 2 },
        trigger: null,
      },
    ],
    ...overrides,
  };
}

function built(overrides: Partial<IntradayBuilt> = {}): IntradayBuilt {
  return {
    kind: 'intraday',
    timeframes: { m5: tfData(), m15: tfData(), h1: tfData() },
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
      technicals: { m5: summary(), m15: summary(), h1: summary() },
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
    ...overrides,
  };
}

describe('stripProAnnotations', () => {
  it('strips all six data classes when neither pro feature is active, and preserves ai/cross markers plus untouched fields', () => {
    const input = built();
    const output = stripProAnnotations(input);

    for (const tf of ['m5', 'm15', 'h1'] as const) {
      const tfOut = output.timeframes[tf];
      expect(tfOut.autoDivergence).toEqual([]);
      expect(tfOut.autoBeichi).toEqual([]);
      expect(tfOut.pattern123).toEqual([]);
      expect(tfOut.secondBreakouts).toEqual([]);
      expect(tfOut.markers.map((m) => m.id)).toEqual(['ai-1', 'plain-1']);
      expect(tfOut.priceConnectors.map((c) => c.group)).toEqual(['ai']);
      expect(tfOut.macdConnectors).toEqual([]);
      expect(tfOut.macdCrossMarkers).toEqual(input.timeframes[tf].macdCrossMarkers);
      expect(tfOut.candles).toBe(input.timeframes[tf].candles);

      const summaryOut = output.sidebar.technicals[tf];
      expect(summaryOut.divergence_candidates).toEqual([]);
      expect(summaryOut.beichi_candidates).toEqual([]);
      expect(summaryOut.candle_patterns).toEqual([]);
      expect(summaryOut.pattern_123).toEqual([]);
      expect(summaryOut.second_breakouts).toEqual([]);
    }

    expect(output.sidebar.optionsLevels).toBeNull();
    expect(output.sidebar.symbol).toBe('NVDA.US');
    expect(output.sidebar.news).toBe(input.sidebar.news);
  });

  it('strips both pattern and options data when the bundle is present but unlicensed (both features locked)', () => {
    setEncBundlePresent(true);
    const output = stripProAnnotations(built());
    expect(output.timeframes.m5.autoDivergence).toEqual([]);
    expect(output.sidebar.optionsLevels).toBeNull();
  });

  it('preserves optionsLevels when options-walls is active', () => {
    activatePro();
    const input = built();
    const output = stripProAnnotations(input);
    expect(output.sidebar.optionsLevels).toEqual(input.sidebar.optionsLevels);
    expect(output.sidebar.optionsLevels).not.toBeNull();
  });

  it('returns the input unchanged (same reference) when both features are active', () => {
    activatePro();
    const input = built();
    const output = stripProAnnotations(input);
    expect(output).toBe(input);
  });

  it('deep-equals the input when both features are active even after a round-trip', () => {
    activatePro();
    const input = built();
    expect(stripProAnnotations(input)).toEqual(input);
  });

  it('preserves a marker/connector with no group at all', () => {
    const input = built({
      timeframes: {
        m5: tfData({
          markers: [marker({ id: 'no-group' })],
          priceConnectors: [],
          macdConnectors: [],
        }),
        m15: tfData(),
        h1: tfData(),
      },
    });
    const output = stripProAnnotations(input);
    expect(output.timeframes.m5.markers.map((m) => m.id)).toEqual(['no-group']);
  });
});
