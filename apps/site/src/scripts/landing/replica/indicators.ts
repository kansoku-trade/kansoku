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
  tone: 'pre' | 'prev' | 'anchor';
}
