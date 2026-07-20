import type { Candle, LinePoint, RawBar, SwingPoint } from '@kansoku/shared/types';
import { ClientError } from '../platform/errors.js';

export function sma(arr: number[], n: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (i < n - 1) {
      out.push(null);
      continue;
    }
    let sum = 0;
    for (let j = i - n + 1; j <= i; j++) sum += arr[j];
    out.push(sum / n);
  }
  return out;
}

export function ema(arr: number[], n: number): (number | null)[] {
  const out: (number | null)[] = [];
  let prev: number | null = null;
  const k = 2 / (n + 1);
  for (let i = 0; i < arr.length; i++) {
    if (i < n - 1) {
      out.push(null);
      continue;
    }
    if (prev === null) {
      let s = 0;
      for (let j = i - n + 1; j <= i; j++) s += arr[j];
      prev = s / n;
    } else {
      prev = arr[i] * k + prev * (1 - k);
    }
    out.push(prev);
  }
  return out;
}

export function macd(
  closes: number[],
  fast = 12,
  slow = 26,
  signal = 9,
): { dif: (number | null)[]; dea: (number | null)[]; hist: (number | null)[] } {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const dif = emaFast.map((f, i) => {
    const s = emaSlow[i];
    return f !== null && s !== null ? f - s : null;
  });
  const start = dif.findIndex((v) => v !== null);
  const dea: (number | null)[] = Array.from({ length: dif.length }, () => null);
  if (start >= 0) {
    const deaTail = ema(dif.slice(start) as number[], signal);
    deaTail.forEach((v, i) => {
      dea[start + i] = v;
    });
  }
  const hist = dif.map((d, i) => {
    const e = dea[i];
    return d !== null && e !== null ? 2 * (d - e) : null;
  });
  return { dif, dea, hist };
}

export function findSwings(
  highs: number[],
  lows: number[],
  timesTs: number[],
  window = 3,
): { swingHighs: SwingPoint[]; swingLows: SwingPoint[] } {
  const swingHighs: SwingPoint[] = [];
  const swingLows: SwingPoint[] = [];
  const n = highs.length;
  for (let i = window; i < n - window; i++) {
    const segH = highs.slice(i - window, i + window + 1);
    if (highs[i] === Math.max(...segH)) swingHighs.push({ time: timesTs[i], price: highs[i] });
    const segL = lows.slice(i - window, i + window + 1);
    if (lows[i] === Math.min(...segL)) swingLows.push({ time: timesTs[i], price: lows[i] });
  }
  return { swingHighs, swingLows };
}

export function toTs(iso: string): number {
  return Math.floor(Date.parse(iso) / 1000);
}

export function ymd(iso: string): string {
  return iso.slice(0, 10);
}

export interface CoercedKlines {
  timesTs: number[];
  dates: string[];
  opens: number[];
  highs: number[];
  lows: number[];
  closes: number[];
  vols: number[];
}

export function coerceKlines(kline: RawBar[], label: string, minBars = 50): CoercedKlines {
  if (!kline || kline.length < minBars) {
    throw new ClientError(
      `sepa: ${label} needs at least ${minBars} bars (got ${kline?.length ?? 0}); SEPA computes MA50/150/200.`,
      'Pull more history: `longbridge kline <SYM> --period day --count 260`.',
    );
  }
  return {
    timesTs: kline.map((b) => toTs(b.time)),
    dates: kline.map((b) => ymd(b.time)),
    opens: kline.map((b) => Number(b.open)),
    highs: kline.map((b) => Number(b.high)),
    lows: kline.map((b) => Number(b.low)),
    closes: kline.map((b) => Number(b.close)),
    vols: kline.map((b) => Number(b.volume)),
  };
}

export function lineData(timesTs: number[], values: (number | null)[]): LinePoint[] {
  const out: LinePoint[] = [];
  for (let i = 0; i < timesTs.length; i++) {
    const v = values[i];
    if (v !== null && v !== undefined) out.push({ time: timesTs[i], value: v });
  }
  return out;
}

export function toCandles(c: CoercedKlines): Candle[] {
  return c.timesTs.map((t, i) => ({
    time: t,
    open: c.opens[i],
    high: c.highs[i],
    low: c.lows[i],
    close: c.closes[i],
  }));
}

export function rsSeries(
  closes: number[],
  timesTs: number[],
  spyMap: Map<number, number>,
  lookback: number,
): LinePoint[] {
  const out: LinePoint[] = [];
  for (let i = lookback; i < closes.length; i++) {
    const tNow = timesTs[i];
    const tPrev = timesTs[i - lookback];
    const sNow = spyMap.get(tNow);
    const sPrev = spyMap.get(tPrev);
    if (sNow === undefined || sPrev === undefined) continue;
    const mRet = closes[i] / closes[i - lookback] - 1;
    const sRet = sNow / sPrev - 1;
    out.push({ time: tNow, value: pyRound((mRet - sRet) * 100, 4) });
  }
  return out;
}

export function pyRound(x: number, digits = 0): number {
  const m = 10 ** digits;
  const v = x * m;
  const floor = Math.floor(v);
  if (v - floor === 0.5) {
    return (floor % 2 === 0 ? floor : floor + 1) / m;
  }
  return Math.round(v) / m;
}
