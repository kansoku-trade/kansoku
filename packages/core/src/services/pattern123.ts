import type { Pattern123, SwingPoint } from "@kansoku/shared/types";

const PIVOT_WINDOW = 3;
const EXTREME_LOOKBACK = 20;
const RANGE_WINDOW = 14;
const MIN_LEG_RANGE_RATIO = 2;

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
    const last = zigzag[zigzag.length - 1];
    if (last && last.isHigh === pivot.isHigh) {
      const keep = pivot.isHigh ? pivot.price >= last.price : pivot.price <= last.price;
      if (keep) zigzag[zigzag.length - 1] = pivot;
    } else {
      zigzag.push(pivot);
    }
  }
  return zigzag;
}

const fmtPrice = (v: number) => `$${v.toFixed(2)}`;

function build123(bullish: boolean, p1: SwingPoint, p2: SwingPoint, p3: SwingPoint, confirm: SwingPoint | null): Pattern123 {
  const implication = bullish
    ? `低点抬高（③ ${fmtPrice(p3.price)} > ① ${fmtPrice(p1.price)}）——卖压衰竭；收盘站上 ② ${fmtPrice(p2.price)} 确认转多，跌破 ① 结构失效`
    : `高点降低（③ ${fmtPrice(p3.price)} < ① ${fmtPrice(p1.price)}）——买力衰竭；收盘跌破 ② ${fmtPrice(p2.price)} 确认转空，升破 ① 结构失效`;
  return {
    kind: bullish ? "bullish" : "bearish",
    status: confirm ? "confirmed" : "forming",
    p1,
    p2,
    p3,
    trigger: p2.price,
    invalidation: p1.price,
    confirm,
    label: bullish ? "底部 123 结构" : "顶部 123 结构",
    implication,
  };
}

export function detect123Patterns(
  highs: number[],
  lows: number[],
  closes: number[],
  timesTs: number[],
): Pattern123[] {
  const pivots = findPivots(highs, lows);

  const avgRangeAt = (end: number) => {
    const from = Math.max(0, end - RANGE_WINDOW + 1);
    let sum = 0;
    for (let j = from; j <= end; j++) sum += highs[j] - lows[j];
    return sum / (end - from + 1);
  };
  const isExtreme = (i: number, bullish: boolean) => {
    const from = Math.max(0, i - EXTREME_LOOKBACK);
    for (let j = from; j < i; j++) {
      if (bullish ? lows[j] < lows[i] : highs[j] > highs[i]) return false;
    }
    return true;
  };
  const point = (p: Pivot): SwingPoint => ({ time: timesTs[p.index], price: p.price });

  const out: Pattern123[] = [];
  for (let k = 0; k + 2 < pivots.length; k++) {
    const p1 = pivots[k];
    const p2 = pivots[k + 1];
    const p3 = pivots[k + 2];
    const bullish = !p1.isHigh;
    if (!isExtreme(p1.index, bullish)) continue;
    if (Math.abs(p2.price - p1.price) < MIN_LEG_RANGE_RATIO * avgRangeAt(p2.index)) continue;
    if (bullish) {
      if (!(p3.price > p1.price && p3.price < p2.price)) continue;
    } else {
      if (!(p3.price < p1.price && p3.price > p2.price)) continue;
    }

    let confirm: SwingPoint | null = null;
    let invalidated = false;
    for (let j = p3.index + 1; j < closes.length; j++) {
      if (bullish ? lows[j] < p1.price : highs[j] > p1.price) {
        invalidated = true;
        break;
      }
      if (bullish ? closes[j] > p2.price : closes[j] < p2.price) {
        confirm = { time: timesTs[j], price: closes[j] };
        break;
      }
    }
    if (invalidated) continue;
    out.push(build123(bullish, point(p1), point(p2), point(p3), confirm));
  }
  return out;
}
