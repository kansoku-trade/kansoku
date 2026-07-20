import { afterEach, describe, expect, it } from 'vitest';
import type { ProDetectors } from '@kansoku/pro-api';
import type { RawBar } from '@kansoku/shared/types';
import { coerceIntradayTimeframe } from '../src/analysis/intraday/timeframe.js';
import {
  activeProDetectors,
  registerProDetectors,
  resetProDetectorsForTests,
} from '../src/pro/detectors.js';
import { setEncBundlePresent, setProPresent } from '../src/pro/bundleState.js';
import { setLicenseManagerForTests, type LicenseManager } from '../src/license/licenseState.js';

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

interface Calls {
  findPriceDivergence: number;
  findMacdBeichi: number;
  detect123Patterns: number;
  detectSecondBreakouts: number;
  detectCandlePatterns: number;
  enrichCandlePatterns: number;
  getOptionsLevels: number;
}

function makeFakeDetectors(): { detectors: ProDetectors; calls: Calls } {
  const calls: Calls = {
    findPriceDivergence: 0,
    findMacdBeichi: 0,
    detect123Patterns: 0,
    detectSecondBreakouts: 0,
    detectCandlePatterns: 0,
    enrichCandlePatterns: 0,
    getOptionsLevels: 0,
  };
  const detectors: ProDetectors = {
    findPriceDivergence: (points, isTop) => {
      calls.findPriceDivergence += 1;
      return isTop && points.length >= 2 ? [{ kind: 'top', a: points[0], b: points[1] }] : [];
    },
    findMacdBeichi: (_hist, highs, _lows, timesTs) => {
      calls.findMacdBeichi += 1;
      return [
        {
          kind: 'top',
          a: { time: timesTs[65], price: highs[65], macd_value: 1 },
          b: { time: timesTs[70], price: highs[70], macd_value: 0.5 },
        },
      ];
    },
    detect123Patterns: (highs, lows, closes, timesTs) => {
      calls.detect123Patterns += 1;
      return [
        {
          kind: 'bullish',
          status: 'confirmed',
          p1: { time: timesTs[60], price: lows[60] },
          p2: { time: timesTs[63], price: highs[63] },
          p3: { time: timesTs[66], price: lows[66] },
          trigger: highs[63],
          invalidation: lows[60],
          confirm: { time: timesTs[70], price: closes[70] },
          label: 'fake123',
          implication: '',
        },
      ];
    },
    detectSecondBreakouts: (highs, _lows, _closes, timesTs) => {
      calls.detectSecondBreakouts += 1;
      return [
        {
          kind: 'H2',
          status: 'confirmed',
          first: { time: timesTs[60], price: highs[60] },
          signal: { time: timesTs[68], price: highs[68] },
          trigger: { time: timesTs[70], price: highs[70] },
        },
      ];
    },
    detectCandlePatterns: (_opens, _highs, lows, closes, timesTs) => {
      calls.detectCandlePatterns += 1;
      return [
        {
          kind: 'hammer',
          time: timesTs[70],
          price: lows[70],
          bias: 'bullish',
          label: 'fakeHammer',
          implication: '',
          span: 1,
          confirm_price: closes[70] + 1,
          invalidate_price: lows[70] - 1,
        },
      ];
    },
    enrichCandlePatterns: (patterns) => {
      calls.enrichCandlePatterns += 1;
      return patterns.map((p) => ({ ...p, score: 90, status: 'confirmed', stats: null }));
    },
    getOptionsLevels: async () => {
      calls.getOptionsLevels += 1;
      return null;
    },
  };
  return { detectors, calls };
}

// 2026-06-01 is a Monday; 14:30Z = 10:30 ET. 80 five-minute bars stay inside the
// regular/post session, so offSessionSignalKeeper never drops a signal.
const BASE = Date.parse('2026-06-01T14:30:00.000Z') / 1000;
function makeBars(n = 80): RawBar[] {
  return Array.from({ length: n }, (_, i) => {
    const c = 100 + Math.sin(i / 4) * 3 + i * 0.05;
    return {
      time: new Date((BASE + i * 300) * 1000).toISOString(),
      open: c,
      high: c + 0.5,
      low: c - 0.5,
      close: c,
      volume: 1000,
    };
  });
}

afterEach(() => {
  resetProDetectorsForTests();
  setProPresent(false);
  setEncBundlePresent(false);
  setLicenseManagerForTests(null);
});

describe('pro detector seam', () => {
  it('flows registered detector outputs into coerceIntradayTimeframe when the feature is active', () => {
    const { detectors, calls } = makeFakeDetectors();
    registerProDetectors(detectors);
    setProPresent(true);
    setLicenseManagerForTests(fakeLicenseManager(true));

    const tf = coerceIntradayTimeframe(makeBars(), 'm5');

    expect(tf.autoBeichi.length).toBeGreaterThan(0);
    expect(tf.pattern123.length).toBeGreaterThan(0);
    expect(tf.secondBreakouts.length).toBeGreaterThan(0);
    expect(tf.candlePatterns.length).toBeGreaterThan(0);
    expect(tf.candlePatterns[0].score).toBe(90);

    expect(calls.findPriceDivergence).toBeGreaterThan(0);
    expect(calls.findMacdBeichi).toBeGreaterThan(0);
    expect(calls.detect123Patterns).toBeGreaterThan(0);
    expect(calls.detectSecondBreakouts).toBeGreaterThan(0);
    expect(calls.detectCandlePatterns).toBeGreaterThan(0);
    expect(calls.enrichCandlePatterns).toBeGreaterThan(0);

    expect(activeProDetectors().getOptionsLevels).toBeDefined();
  });

  it('does not invoke registered detectors and yields empty outputs when the feature is not active', () => {
    const { detectors, calls } = makeFakeDetectors();
    registerProDetectors(detectors);
    setProPresent(false);

    const tf = coerceIntradayTimeframe(makeBars(), 'm5');

    expect(tf.autoDivergence).toEqual([]);
    expect(tf.autoBeichi).toEqual([]);
    expect(tf.pattern123).toEqual([]);
    expect(tf.secondBreakouts).toEqual([]);
    expect(tf.candlePatterns).toEqual([]);

    expect(calls.findPriceDivergence).toBe(0);
    expect(calls.findMacdBeichi).toBe(0);
    expect(calls.detect123Patterns).toBe(0);
    expect(calls.detectSecondBreakouts).toBe(0);
    expect(calls.detectCandlePatterns).toBe(0);
    expect(calls.enrichCandlePatterns).toBe(0);

    expect(activeProDetectors().getOptionsLevels).toBeUndefined();
  });
});
