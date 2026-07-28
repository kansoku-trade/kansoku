import type { Candle } from '../kline';

const PIVOT_WINDOW = 3;

export interface Pivot {
  index: number;
  price: number;
  isHigh: boolean;
}

export const findPivots = (candles: Candle[]): Pivot[] => {
  const zigzag: Pivot[] = [];
  for (let i = PIVOT_WINDOW; i < candles.length - PIVOT_WINDOW; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - PIVOT_WINDOW; j <= i + PIVOT_WINDOW; j++) {
      if (candles[j].high > candles[i].high) isHigh = false;
      if (candles[j].low < candles[i].low) isLow = false;
    }
    if (isHigh === isLow) continue;
    const pivot: Pivot = isHigh
      ? { index: i, price: candles[i].high, isHigh: true }
      : { index: i, price: candles[i].low, isHigh: false };
    const last = zigzag.at(-1);
    if (last && last.isHigh === pivot.isHigh) {
      const keep = pivot.isHigh ? pivot.price >= last.price : pivot.price <= last.price;
      if (keep) zigzag[zigzag.length - 1] = pivot;
      continue;
    }
    zigzag.push(pivot);
  }
  return zigzag;
};

export interface Structure123 {
  kind: 'bullish' | 'bearish';
  label: string;
  p1: Pivot;
  p2: Pivot;
  p3: Pivot;
  trigger: number;
  confirmIndex: number | null;
}

export const detect123 = (candles: Candle[]): Structure123 | null => {
  const pivots = findPivots(candles);
  for (let i = pivots.length - 3; i >= 0; i--) {
    const [p1, p2, p3] = [pivots[i], pivots[i + 1], pivots[i + 2]];
    if (p1.isHigh === p2.isHigh || p2.isHigh === p3.isHigh) continue;
    const bullish = !p1.isHigh;
    const held = bullish ? p3.price > p1.price : p3.price < p1.price;
    if (!held) continue;

    let confirmIndex: number | null = null;
    for (let j = p3.index + 1; j < candles.length; j++) {
      const broke = bullish ? candles[j].close > p2.price : candles[j].close < p2.price;
      if (broke) {
        confirmIndex = j;
        break;
      }
    }
    return {
      kind: bullish ? 'bullish' : 'bearish',
      label: bullish ? '底部 123 结构' : '顶部 123 结构',
      p1,
      p2,
      p3,
      trigger: p2.price,
      confirmIndex,
    };
  }
  return null;
};

export type PatternStatus = 'pending' | 'confirmed';

export interface CandlePattern {
  index: number;
  label: string;
  bias: 'bullish' | 'bearish';
  status: PatternStatus;
}

const body = (candle: Candle): number => Math.abs(candle.close - candle.open);
const upperWick = (candle: Candle): number => candle.high - Math.max(candle.open, candle.close);
const lowerWick = (candle: Candle): number => Math.min(candle.open, candle.close) - candle.low;

const classify = (prev: Candle, candle: Candle): Omit<CandlePattern, 'index' | 'status'> | null => {
  const size = body(candle);
  const range = candle.high - candle.low;
  if (range <= 0) return null;

  if (candle.up && !prev.up && candle.close > prev.open && candle.open < prev.close) {
    return { label: '看涨吞没', bias: 'bullish' };
  }
  if (!candle.up && prev.up && candle.close < prev.open && candle.open > prev.close) {
    return { label: '看跌吞没', bias: 'bearish' };
  }
  if (size < range * 0.34 && lowerWick(candle) > size * 2 && upperWick(candle) < size) {
    return { label: '锤子线', bias: 'bullish' };
  }
  if (size < range * 0.34 && upperWick(candle) > size * 2 && lowerWick(candle) < size) {
    return { label: '射击之星', bias: 'bearish' };
  }
  if (!candle.up && prev.up && candle.close < (prev.open + prev.close) / 2 && candle.open > prev.close) {
    return { label: '乌云盖顶', bias: 'bearish' };
  }
  if (candle.up && !prev.up && candle.close > (prev.open + prev.close) / 2 && candle.open < prev.close) {
    return { label: '刺透形态', bias: 'bullish' };
  }
  return null;
};

// Mirrors the app's three-bar confirmation window: a pattern that neither confirms nor
// invalidates within three bars expires and is never drawn.
const CONFIRM_WINDOW = 3;

export const detectCandlePatterns = (candles: Candle[], limit = 3): CandlePattern[] => {
  const found: CandlePattern[] = [];
  for (let i = candles.length - 1; i > 0 && found.length < limit; i--) {
    const hit = classify(candles[i - 1], candles[i]);
    if (!hit) continue;
    if (found.some((item) => Math.abs(item.index - i) < 4)) continue;

    let status: PatternStatus = 'pending';
    for (let j = i + 1; j <= Math.min(candles.length - 1, i + CONFIRM_WINDOW); j++) {
      const confirmed =
        hit.bias === 'bullish'
          ? candles[j].close > candles[i].high
          : candles[j].close < candles[i].low;
      if (confirmed) {
        status = 'confirmed';
        break;
      }
    }
    found.push({ index: i, ...hit, status });
  }
  return found.reverse();
};

export interface DivergenceLeg {
  index: number;
  price: number;
  macd: number;
}

export interface Divergence {
  kind: 'top' | 'bottom';
  label: string;
  a: DivergenceLeg;
  b: DivergenceLeg;
}

export const detectDivergence = (
  candles: Candle[],
  dif: Array<number | null>,
): Divergence | null => {
  const pivots = findPivots(candles);
  const at = (index: number): number | null => dif[index] ?? null;

  for (const isHigh of [true, false]) {
    const legs = pivots.filter((pivot) => pivot.isHigh === isHigh);
    for (let i = legs.length - 1; i >= 1; i--) {
      const b = legs[i];
      const a = legs[i - 1];
      const macdA = at(a.index);
      const macdB = at(b.index);
      if (macdA === null || macdB === null) continue;
      const priceExtends = isHigh ? b.price > a.price : b.price < a.price;
      const macdFades = isHigh ? macdB < macdA : macdB > macdA;
      if (!priceExtends || !macdFades) continue;
      return {
        kind: isHigh ? 'top' : 'bottom',
        label: isHigh ? 'MACD 顶背驰' : 'MACD 底背驰',
        a: { index: a.index, price: a.price, macd: macdA },
        b: { index: b.index, price: b.price, macd: macdB },
      };
    }
  }
  return null;
};
