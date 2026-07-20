import type { SecondBreakout, SwingPoint } from '@kansoku/shared/types';
import { ema } from './indicators.js';

const PIVOT_WINDOW = 3;
const EMA_PERIOD = 20;
const EMA_SLOPE_LOOKBACK = 5;
const MAX_ATTEMPT_GAP = 25;
const RANGE_CROSS_WINDOW = 20;
const RANGE_CROSS_MAX = 3;

interface Pivot {
  index: number;
  price: number;
  isHigh: boolean;
}

function findPivots(highs: number[], lows: number[]): Pivot[] {
  const n = highs.length;
  const zigzag: Pivot[] = [];
  for (let i = PIVOT_WINDOW; i < n - PIVOT_WINDOW; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - PIVOT_WINDOW; j <= i + PIVOT_WINDOW; j++) {
      if (highs[j] > highs[i]) isHigh = false;
      if (lows[j] < lows[i]) isLow = false;
    }
    if (isHigh === isLow) continue;
    const pivot: Pivot = isHigh
      ? { index: i, price: highs[i], isHigh: true }
      : { index: i, price: lows[i], isHigh: false };
    const last = zigzag.at(-1);
    if (last && last.isHigh === pivot.isHigh) {
      const keep = pivot.isHigh ? pivot.price >= last.price : pivot.price <= last.price;
      if (keep) zigzag[zigzag.length - 1] = pivot;
    } else {
      zigzag.push(pivot);
    }
  }
  return zigzag;
}

export function detectSecondBreakouts(
  highs: number[],
  lows: number[],
  closes: number[],
  timesTs: number[],
): SecondBreakout[] {
  const emaLine = ema(closes, EMA_PERIOD);
  const pivots = findPivots(highs, lows);

  const trendAt = (i: number): 'up' | 'down' | null => {
    const e = emaLine[i];
    const ePrev = emaLine[i - EMA_SLOPE_LOOKBACK];
    if (e === null || e === undefined || ePrev === null || ePrev === undefined) return null;
    if (closes[i] > e && e > ePrev) return 'up';
    if (closes[i] < e && e < ePrev) return 'down';
    return null;
  };

  const isRange = (i: number): boolean => {
    const from = Math.max(EMA_PERIOD - 1, i - RANGE_CROSS_WINDOW);
    let crosses = 0;
    let prevSign: number | null = null;
    for (let j = from; j <= i; j++) {
      const e = emaLine[j];
      if (e === null || e === undefined) continue;
      const sign = closes[j] >= e ? 1 : -1;
      if (prevSign !== null && sign !== prevSign) crosses++;
      prevSign = sign;
    }
    return crosses > RANGE_CROSS_MAX;
  };

  const point = (p: Pivot): SwingPoint => ({ time: timesTs[p.index], price: p.price });

  const out: SecondBreakout[] = [];
  for (let k = 0; k + 4 < pivots.length; k++) {
    const p0 = pivots[k];
    const p1 = pivots[k + 1];
    const p2 = pivots[k + 2];
    const p3 = pivots[k + 3];
    const p4 = pivots[k + 4];
    const bullish = p0.isHigh;

    if (bullish) {
      if (!(p2.price < p0.price)) continue;
      if (!(p3.price < p1.price)) continue;
    } else {
      if (!(p2.price > p0.price)) continue;
      if (!(p3.price > p1.price)) continue;
    }
    if (p4.index - p2.index > MAX_ATTEMPT_GAP) continue;
    if (trendAt(p0.index) !== (bullish ? 'up' : 'down')) continue;
    if (trendAt(p4.index) !== (bullish ? 'up' : 'down')) continue;
    if (isRange(p4.index)) continue;

    let trigger: SwingPoint | null = null;
    let invalidated = false;
    for (let j = p4.index + 1; j < closes.length; j++) {
      if (bullish ? lows[j] < p3.price : highs[j] > p3.price) {
        invalidated = true;
        break;
      }
      if (bullish ? highs[j] > p4.price : lows[j] < p4.price) {
        trigger = { time: timesTs[j], price: bullish ? highs[j] : lows[j] };
        break;
      }
    }
    if (invalidated) continue;

    out.push({
      kind: bullish ? 'H2' : 'L2',
      status: trigger ? 'confirmed' : 'forming',
      first: point(p2),
      signal: point(p4),
      trigger,
    });
  }
  return out;
}
