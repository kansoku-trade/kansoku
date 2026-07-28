import { describe, expect, it } from 'vitest';

import { buildCandles } from './kline';
import { candleShape, seedFlow } from './shapes';

describe('candleShape', () => {
  const candles = buildCandles(30, { seed: 9, start: 120, volatility: 5 });

  it('returns exactly count points', () => {
    expect(candleShape(candles, 300)).toHaveLength(300);
  });

  it('keeps every point within the [0, 1] closed range', () => {
    const points = candleShape(candles, 400, { seed: 3 });
    for (const point of points) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(1);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic for the same candles, count, and options', () => {
    const a = candleShape(candles, 250, { seed: 11, bodyRatio: 0.7 });
    const b = candleShape(candles, 250, { seed: 11, bodyRatio: 0.7 });
    expect(a).toEqual(b);
  });

  it('distributes roughly bodyRatio of points inside the candle body', () => {
    const candle = { open: 100, close: 110, high: 130, low: 90, up: true };
    const bodyRatio = 0.82;
    const points = candleShape([candle], 5000, { seed: 21, bodyRatio });

    const priceMin = candle.low;
    const priceMax = candle.high;
    const bodyBottom = Math.min(candle.open, candle.close);
    const bodyTop = Math.max(candle.open, candle.close);

    const inBody = points.filter((point) => {
      const price = priceMin + (1 - point.y) * (priceMax - priceMin);
      return price >= bodyBottom - 1e-9 && price <= bodyTop + 1e-9;
    }).length;

    const ratio = inBody / points.length;
    expect(ratio).toBeGreaterThanOrEqual(bodyRatio - 0.05);
    expect(ratio).toBeLessThanOrEqual(bodyRatio + 0.05);
  });

  it('spreads points horizontally within their own candle slot', () => {
    const threeCandles = [
      { open: 100, close: 110, high: 130, low: 90, up: true },
      { open: 110, close: 100, high: 130, low: 90, up: false },
      { open: 100, close: 115, high: 140, low: 85, up: true },
    ];
    const count = 3000;
    const points = candleShape(threeCandles, count, { seed: 5 });
    const slotWidth = 1 / threeCandles.length;

    const xsByCandle = new Map<number, number[]>();
    for (let i = 0; i < count; i++) {
      const candleIndex = Math.min(
        threeCandles.length - 1,
        Math.floor((i / count) * threeCandles.length),
      );
      const point = points[i];
      const slotMin = candleIndex * slotWidth;
      const slotMax = (candleIndex + 1) * slotWidth;
      expect(point.x).toBeGreaterThanOrEqual(slotMin);
      expect(point.x).toBeLessThanOrEqual(slotMax);

      const xs = xsByCandle.get(candleIndex) ?? [];
      xs.push(point.x);
      xsByCandle.set(candleIndex, xs);
    }

    for (const xs of xsByCandle.values()) {
      expect(new Set(xs).size).toBeGreaterThan(1);
      const mean = xs.reduce((sum, x) => sum + x, 0) / xs.length;
      const variance = xs.reduce((sum, x) => sum + (x - mean) ** 2, 0) / xs.length;
      expect(variance).toBeGreaterThan(1e-6);
    }
  });
});

describe('seedFlow', () => {
  it('returns exactly count seeds', () => {
    expect(seedFlow(120, 4)).toHaveLength(120);
  });

  it('distributes link evenly across linkCount', () => {
    const seeds = seedFlow(120, 4, 5);
    const perLink = new Map<number, number>();
    for (const seed of seeds) {
      perLink.set(seed.link, (perLink.get(seed.link) ?? 0) + 1);
    }
    expect([...perLink.keys()].sort()).toEqual([0, 1, 2, 3]);
    for (const link of [0, 1, 2, 3]) {
      expect(perLink.get(link)).toBe(30);
    }
  });

  it('keeps t, offset, and speed within their ranges', () => {
    const seeds = seedFlow(500, 6, 13);
    for (const seed of seeds) {
      expect(seed.t).toBeGreaterThanOrEqual(0);
      expect(seed.t).toBeLessThan(1);
      expect(seed.offset).toBeGreaterThanOrEqual(-1);
      expect(seed.offset).toBeLessThanOrEqual(1);
      expect(seed.speed).toBeGreaterThanOrEqual(0.16);
      expect(seed.speed).toBeLessThanOrEqual(0.46);
    }
  });

  it('is deterministic for the same count, linkCount, and seed', () => {
    const a = seedFlow(80, 5, 99);
    const b = seedFlow(80, 5, 99);
    expect(a).toEqual(b);
  });

  it('returns an empty array when linkCount is 0', () => {
    expect(seedFlow(50, 0)).toEqual([]);
  });
});
