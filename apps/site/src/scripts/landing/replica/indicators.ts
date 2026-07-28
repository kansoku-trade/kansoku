import type { Candle } from '../kline';

export const ema = (values: number[], period: number): Array<number | null> => {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
};

export interface MacdResult {
  dif: Array<number | null>;
  dea: Array<number | null>;
  hist: Array<number | null>;
}

export const macd = (values: number[]): MacdResult => {
  const fast = ema(values, 12);
  const slow = ema(values, 26);
  const dif: Array<number | null> = values.map((_, i) => {
    const f = fast[i];
    const s = slow[i];
    return f === null || s === null ? null : f - s;
  });
  const difDefined: number[] = [];
  const difIndex: number[] = [];
  dif.forEach((value, index) => {
    if (value !== null) {
      difDefined.push(value);
      difIndex.push(index);
    }
  });
  const deaDefined = ema(difDefined, 9);
  const dea: Array<number | null> = new Array(values.length).fill(null);
  deaDefined.forEach((value, i) => {
    if (value !== null) dea[difIndex[i]] = value;
  });
  const hist: Array<number | null> = values.map((_, i) => {
    const d = dif[i];
    const e = dea[i];
    return d === null || e === null ? null : (d - e) * 2;
  });
  return { dif, dea, hist };
};

export interface PriceLevel {
  label: string;
  value: number;
  tone: 'pre' | 'prev' | 'anchor' | 'last';
}

export const deriveLevels = (candles: Candle[]): PriceLevel[] => {
  const recent = candles.slice(-Math.min(candles.length, 60));
  let high = -Infinity;
  let low = Infinity;
  for (const candle of recent) {
    if (candle.high > high) high = candle.high;
    if (candle.low < low) low = candle.low;
  }
  const last = candles[candles.length - 1];
  const mid = (high + low) / 2;
  return [
    { label: '盘前高', value: high - (high - mid) * 0.12, tone: 'pre' },
    { label: '盘前低', value: mid + (high - mid) * 0.18, tone: 'pre' },
    { label: '昨高', value: mid, tone: 'prev' },
    { label: '锚', value: mid - (mid - low) * 0.35, tone: 'anchor' },
    { label: '昨低', value: low + (mid - low) * 0.08, tone: 'prev' },
    { label: '', value: last.close, tone: 'last' },
  ];
};
