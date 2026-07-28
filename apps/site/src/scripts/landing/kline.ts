export interface Candle {
  open: number;
  close: number;
  high: number;
  low: number;
  up: boolean;
}

export interface KlineOptions {
  seed?: number;
  start?: number;
  volatility?: number;
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

export const buildCandles = (count: number, options?: KlineOptions): Candle[] => {
  const seed = options?.seed ?? 20260728;
  const start = options?.start ?? 100;
  const volatility = options?.volatility ?? 3.2;
  const random = mulberry32(seed);

  const candles: Candle[] = [];
  let open = start;
  for (let i = 0; i < count; i++) {
    const close = open + (random() - 0.5) * volatility;
    const bodyTop = Math.max(open, close);
    const bodyBottom = Math.min(open, close);
    const high = bodyTop + random() * volatility * 0.5;
    const low = bodyBottom - random() * volatility * 0.5;
    candles.push({ open, close, high, low, up: close >= open });
    open = close;
  }
  return candles;
};
