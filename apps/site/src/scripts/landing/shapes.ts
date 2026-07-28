import type { Candle } from './kline';

export interface NormPoint {
  x: number;
  y: number;
}

export interface CandleShapeOptions {
  seed?: number;
  bodyRatio?: number;
}

const mulberry32 = (seed: number) => {
  let state = seed;
  return (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const candleShape = (
  candles: Candle[],
  count: number,
  options?: CandleShapeOptions,
): NormPoint[] => {
  const points: NormPoint[] = [];
  if (candles.length === 0 || count <= 0) return points;

  const seed = options?.seed ?? 20260728;
  const bodyRatio = options?.bodyRatio ?? 0.82;
  const random = mulberry32(seed);

  const priceMin = Math.min(...candles.map((candle) => candle.low));
  const priceMax = Math.max(...candles.map((candle) => candle.high));
  const priceRange = priceMax - priceMin || 1;

  for (let i = 0; i < count; i++) {
    const candleIndex = Math.min(candles.length - 1, Math.floor((i / count) * candles.length));
    const candle = candles[candleIndex];
    const bodyTop = Math.max(candle.open, candle.close);
    const bodyBottom = Math.min(candle.open, candle.close);

    let price: number;
    if (random() < bodyRatio) {
      price = bodyBottom + random() * (bodyTop - bodyBottom);
    } else if (random() < 0.5) {
      price = bodyTop + random() * (candle.high - bodyTop);
    } else {
      price = candle.low + random() * (bodyBottom - candle.low);
    }

    const x = (candleIndex + 0.5) / candles.length;
    const y = 1 - (price - priceMin) / priceRange;
    points.push({ x, y });
  }

  return points;
};

export interface FlowSeed {
  link: number;
  t: number;
  offset: number;
  speed: number;
}

export const seedFlow = (count: number, linkCount: number, seed?: number): FlowSeed[] => {
  if (linkCount <= 0) return [];

  const random = mulberry32(seed ?? 20260728);
  const seeds: FlowSeed[] = [];
  for (let i = 0; i < count; i++) {
    seeds.push({
      link: i % linkCount,
      t: random(),
      offset: random() * 2 - 1,
      speed: 0.16 + random() * 0.3,
    });
  }
  return seeds;
};
