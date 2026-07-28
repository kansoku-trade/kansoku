import { describe, expect, it } from 'vitest';

import { buildCandles } from './kline';

describe('buildCandles', () => {
  it('produces identical output for the same seed and options', () => {
    const a = buildCandles(40, { seed: 7, start: 200, volatility: 4 });
    const b = buildCandles(40, { seed: 7, start: 200, volatility: 4 });
    expect(a).toEqual(b);
  });

  it('produces different output for a different seed', () => {
    const a = buildCandles(40, { seed: 1 });
    const b = buildCandles(40, { seed: 2 });
    expect(a).not.toEqual(b);
  });

  it('returns exactly count candles', () => {
    expect(buildCandles(0)).toHaveLength(0);
    expect(buildCandles(17)).toHaveLength(17);
    expect(buildCandles(200)).toHaveLength(200);
  });

  it('keeps every candle internally consistent', () => {
    const candles = buildCandles(500, { seed: 42, start: 55, volatility: 6.5 });
    for (const candle of candles) {
      expect(candle.high).toBeGreaterThanOrEqual(Math.max(candle.open, candle.close));
      expect(candle.low).toBeLessThanOrEqual(Math.min(candle.open, candle.close));
      expect(candle.up).toBe(candle.close >= candle.open);
    }
  });
});
