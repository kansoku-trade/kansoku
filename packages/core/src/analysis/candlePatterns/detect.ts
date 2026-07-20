import type { CandlePattern, CandlePatternKind } from '@kansoku/shared/types';
import { CANDLE_PATTERN_META } from './meta.js';

const AVG_BODY_WINDOW = 14;
const TREND_LOOKBACK = 4;
const MIN_BODY_RATIO = 0.8;
const STAR_BODY_RATIO = 0.5;
const STAR_TOLERANCE_RATIO = 0.25;
const HARAMI_BODY_RATIO = 0.6;
const TREND_MIN_BODY_RATIO = 1;
const TREND_MIN_DIRECTIONAL_STEPS = 2;
const CLOSE_NEAR_EXTREME_BODY_RATIO = 0.5;
const PIN_BAR_EXTREME_LOOKBACK = 3;
const LONG_SHADOW_RANGE_RATIO = 0.6;
const SMALL_BODY_RANGE_RATIO = 0.3;
const SMALL_SHADOW_RANGE_RATIO = 0.15;
const AVG_RANGE_WINDOW = 14;
const DOJI_BODY_RANGE_RATIO = 0.05;
const DOJI_LONG_SHADOW_RANGE_RATIO = 0.7;
const DOJI_LEGGED_SHADOW_RANGE_RATIO = 0.35;
const TWEEZER_TOLERANCE_RANGE_RATIO = 0.1;
const MARUBOZU_BODY_RANGE_RATIO = 0.85;
const MARUBOZU_BODY_AVG_RATIO = 1.3;

export function detectCandlePatterns(
  opens: number[],
  highs: number[],
  lows: number[],
  closes: number[],
  timesTs: number[],
): CandlePattern[] {
  const n = Math.min(opens.length, highs.length, lows.length, closes.length, timesTs.length);
  const validBar = (i: number) =>
    Number.isFinite(opens[i]) &&
    Number.isFinite(highs[i]) &&
    Number.isFinite(lows[i]) &&
    Number.isFinite(closes[i]) &&
    Number.isFinite(timesTs[i]) &&
    highs[i] >= Math.max(opens[i], closes[i]) &&
    lows[i] <= Math.min(opens[i], closes[i]);
  const body = (i: number) => Math.abs(closes[i] - opens[i]);
  const range = (i: number) => highs[i] - lows[i];
  const green = (i: number) => closes[i] > opens[i];
  const red = (i: number) => closes[i] < opens[i];
  const bodyTop = (i: number) => Math.max(opens[i], closes[i]);
  const bodyBottom = (i: number) => Math.min(opens[i], closes[i]);
  const upperShadow = (i: number) => highs[i] - bodyTop(i);
  const lowerShadow = (i: number) => bodyBottom(i) - lows[i];

  const avgBody = (i: number) => {
    const from = Math.max(0, i - AVG_BODY_WINDOW);
    let sum = 0;
    let count = 0;
    for (let j = from; j < i; j++) {
      if (!validBar(j)) continue;
      sum += body(j);
      count += 1;
    }
    return count ? sum / count : 0;
  };

  const avgRange = (i: number) => {
    const from = Math.max(0, i - AVG_RANGE_WINDOW);
    let sum = 0;
    let count = 0;
    for (let j = from; j < i; j++) {
      if (!validBar(j)) continue;
      sum += range(j);
      count += 1;
    }
    return count ? sum / count : 0;
  };

  const isLocalLow = (i: number) => {
    if (i < PIN_BAR_EXTREME_LOOKBACK) return false;
    let minPrevLow = Infinity;
    for (let j = i - PIN_BAR_EXTREME_LOOKBACK; j < i; j++) {
      if (!validBar(j)) return false;
      minPrevLow = Math.min(minPrevLow, lows[j]);
    }
    return lows[i] <= minPrevLow;
  };

  const isLocalHigh = (i: number) => {
    if (i < PIN_BAR_EXTREME_LOOKBACK) return false;
    let maxPrevHigh = -Infinity;
    for (let j = i - PIN_BAR_EXTREME_LOOKBACK; j < i; j++) {
      if (!validBar(j)) return false;
      maxPrevHigh = Math.max(maxPrevHigh, highs[j]);
    }
    return highs[i] >= maxPrevHigh;
  };

  const trendInto = (s: number, direction: 'down' | 'up') => {
    if (s < TREND_LOOKBACK) return false;
    const from = s - TREND_LOOKBACK;
    const to = s - 1;
    const ab = avgBody(s);
    if (ab <= 0) return false;

    let directionalSteps = 0;
    for (let j = from + 1; j <= to; j++) {
      if (!validBar(j - 1) || !validBar(j)) return false;
      if (direction === 'down' ? closes[j] < closes[j - 1] : closes[j] > closes[j - 1])
        directionalSteps += 1;
    }

    const net = closes[to] - closes[from];
    return direction === 'down'
      ? net <= -TREND_MIN_BODY_RATIO * ab && directionalSteps >= TREND_MIN_DIRECTIONAL_STEPS
      : net >= TREND_MIN_BODY_RATIO * ab && directionalSteps >= TREND_MIN_DIRECTIONAL_STEPS;
  };
  const downtrendInto = (s: number) => trendInto(s, 'down');
  const uptrendInto = (s: number) => trendInto(s, 'up');
  const opensInsidePreviousBody = (i: number) =>
    opens[i] > bodyBottom(i - 1) && opens[i] < bodyTop(i - 1);
  const closesNearHigh = (i: number) => upperShadow(i) <= CLOSE_NEAR_EXTREME_BODY_RATIO * body(i);
  const closesNearLow = (i: number) => lowerShadow(i) <= CLOSE_NEAR_EXTREME_BODY_RATIO * body(i);

  const taken = new Map<number, CandlePatternKind>();
  const out: CandlePattern[] = [];
  const push = (kind: CandlePatternKind, i: number, price: number, span = 1) => {
    const start = i - span + 1;
    for (let j = start; j <= i; j++) if (taken.has(j)) return;
    for (let j = start; j <= i; j++) taken.set(j, kind);
    const meta = CANDLE_PATTERN_META[kind];
    let spanLow = Infinity;
    let spanHigh = -Infinity;
    for (let j = start; j <= i; j++) {
      spanLow = Math.min(spanLow, lows[j]);
      spanHigh = Math.max(spanHigh, highs[j]);
    }
    let confirm_price: number | null = null;
    let invalidate_price: number | null = null;
    if (meta.bias === 'bullish') {
      confirm_price = bodyTop(i);
      invalidate_price = spanLow;
    } else if (meta.bias === 'bearish') {
      confirm_price = bodyBottom(i);
      invalidate_price = spanHigh;
    }
    out.push({
      kind,
      time: timesTs[i],
      price,
      bias: meta.bias,
      label: meta.label,
      implication: meta.implication,
      span,
      confirm_price,
      invalidate_price,
    });
  };

  for (let i = 2; i < n; i++) {
    if (!validBar(i - 2) || !validBar(i - 1) || !validBar(i)) continue;
    const ab = avgBody(i);
    if (ab <= 0) continue;
    const b1 = body(i - 2);
    const b2 = body(i - 1);
    const b3 = body(i);
    const mid1 = (opens[i - 2] + closes[i - 2]) / 2;

    if (
      red(i - 2) &&
      b1 >= ab &&
      b2 <= STAR_BODY_RATIO * b1 &&
      bodyTop(i - 1) <= closes[i - 2] + STAR_TOLERANCE_RATIO * b1 &&
      green(i) &&
      b3 >= MIN_BODY_RATIO * ab &&
      closes[i] >= mid1 &&
      downtrendInto(i - 2)
    ) {
      push('morning_star', i, lows[i - 1], 3);
    } else if (
      green(i - 2) &&
      b1 >= ab &&
      b2 <= STAR_BODY_RATIO * b1 &&
      bodyBottom(i - 1) >= closes[i - 2] - STAR_TOLERANCE_RATIO * b1 &&
      red(i) &&
      b3 >= MIN_BODY_RATIO * ab &&
      closes[i] <= mid1 &&
      uptrendInto(i - 2)
    ) {
      push('evening_star', i, highs[i - 1], 3);
    }
  }

  for (let i = 2; i < n; i++) {
    if (taken.get(i - 1) === 'three_white_soldiers' || taken.get(i - 1) === 'three_black_crows')
      continue;
    if (!validBar(i - 2) || !validBar(i - 1) || !validBar(i)) continue;
    const ab = avgBody(i);
    if (ab <= 0) continue;
    const strong = (j: number) => body(j) >= MIN_BODY_RATIO * ab;

    if (
      green(i - 2) &&
      green(i - 1) &&
      green(i) &&
      strong(i - 2) &&
      strong(i - 1) &&
      strong(i) &&
      closes[i - 1] > closes[i - 2] &&
      closes[i] > closes[i - 1] &&
      opensInsidePreviousBody(i - 1) &&
      opensInsidePreviousBody(i) &&
      closesNearHigh(i - 2) &&
      closesNearHigh(i - 1) &&
      closesNearHigh(i) &&
      downtrendInto(i - 2)
    ) {
      push('three_white_soldiers', i, lows[i - 2], 3);
    } else if (
      red(i - 2) &&
      red(i - 1) &&
      red(i) &&
      strong(i - 2) &&
      strong(i - 1) &&
      strong(i) &&
      closes[i - 1] < closes[i - 2] &&
      closes[i] < closes[i - 1] &&
      opensInsidePreviousBody(i - 1) &&
      opensInsidePreviousBody(i) &&
      closesNearLow(i - 2) &&
      closesNearLow(i - 1) &&
      closesNearLow(i) &&
      uptrendInto(i - 2)
    ) {
      push('three_black_crows', i, highs[i - 2], 3);
    }
  }

  for (let i = 1; i < n; i++) {
    if (!validBar(i - 1) || !validBar(i)) continue;
    const ab = avgBody(i);
    if (ab <= 0) continue;
    const bA = body(i - 1);
    const bB = body(i);
    const midA = (opens[i - 1] + closes[i - 1]) / 2;

    if (
      bB > bA &&
      bB >= MIN_BODY_RATIO * ab &&
      red(i - 1) &&
      green(i) &&
      opens[i] <= closes[i - 1] &&
      closes[i] >= opens[i - 1] &&
      downtrendInto(i - 1)
    ) {
      push('bullish_engulfing', i, lows[i], 2);
    } else if (
      bB > bA &&
      bB >= MIN_BODY_RATIO * ab &&
      green(i - 1) &&
      red(i) &&
      opens[i] >= closes[i - 1] &&
      closes[i] <= opens[i - 1] &&
      uptrendInto(i - 1)
    ) {
      push('bearish_engulfing', i, highs[i], 2);
    } else if (
      red(i) &&
      green(i - 1) &&
      bA >= ab &&
      bB >= MIN_BODY_RATIO * ab &&
      opens[i] >= closes[i - 1] &&
      closes[i] < midA &&
      closes[i] > opens[i - 1] &&
      uptrendInto(i - 1)
    ) {
      push('dark_cloud_cover', i, highs[i], 2);
    } else if (
      green(i) &&
      red(i - 1) &&
      bA >= ab &&
      bB >= MIN_BODY_RATIO * ab &&
      opens[i] <= closes[i - 1] &&
      closes[i] > midA &&
      closes[i] < opens[i - 1] &&
      downtrendInto(i - 1)
    ) {
      push('piercing_line', i, lows[i], 2);
    } else if (
      red(i - 1) &&
      green(i) &&
      bA >= ab &&
      bB <= HARAMI_BODY_RATIO * bA &&
      bodyTop(i) <= opens[i - 1] &&
      bodyBottom(i) >= closes[i - 1] &&
      downtrendInto(i - 1)
    ) {
      push('bullish_harami', i, lows[i], 2);
    } else if (
      green(i - 1) &&
      red(i) &&
      bA >= ab &&
      bB <= HARAMI_BODY_RATIO * bA &&
      bodyTop(i) <= closes[i - 1] &&
      bodyBottom(i) >= opens[i - 1] &&
      uptrendInto(i - 1)
    ) {
      push('bearish_harami', i, highs[i], 2);
    } else {
      const ar = avgRange(i);
      if (
        ar > 0 &&
        uptrendInto(i - 1) &&
        green(i - 1) &&
        red(i) &&
        Math.abs(highs[i] - highs[i - 1]) <= TWEEZER_TOLERANCE_RANGE_RATIO * ar
      ) {
        push('tweezer_top', i, Math.max(highs[i], highs[i - 1]), 2);
      } else if (
        ar > 0 &&
        downtrendInto(i - 1) &&
        red(i - 1) &&
        green(i) &&
        Math.abs(lows[i] - lows[i - 1]) <= TWEEZER_TOLERANCE_RANGE_RATIO * ar
      ) {
        push('tweezer_bottom', i, Math.min(lows[i], lows[i - 1]), 2);
      }
    }
  }

  for (let i = 1; i < n; i++) {
    if (!validBar(i)) continue;
    const r = range(i);
    const b = body(i);
    if (r <= 0) continue;

    if ((uptrendInto(i) || downtrendInto(i)) && b <= DOJI_BODY_RANGE_RATIO * r) {
      if (upperShadow(i) >= DOJI_LONG_SHADOW_RANGE_RATIO * r && uptrendInto(i)) {
        push('gravestone_doji', i, highs[i]);
        continue;
      } else if (lowerShadow(i) >= DOJI_LONG_SHADOW_RANGE_RATIO * r && downtrendInto(i)) {
        push('dragonfly_doji', i, lows[i]);
        continue;
      } else if (
        upperShadow(i) >= DOJI_LEGGED_SHADOW_RANGE_RATIO * r &&
        lowerShadow(i) >= DOJI_LEGGED_SHADOW_RANGE_RATIO * r
      ) {
        push('long_legged_doji', i, closes[i]);
        continue;
      } else {
        push('doji', i, closes[i]);
        continue;
      }
    }

    const longLower =
      lowerShadow(i) >= LONG_SHADOW_RANGE_RATIO * r &&
      b <= SMALL_BODY_RANGE_RATIO * r &&
      upperShadow(i) <= SMALL_SHADOW_RANGE_RATIO * r;
    const longUpper =
      upperShadow(i) >= LONG_SHADOW_RANGE_RATIO * r &&
      b <= SMALL_BODY_RANGE_RATIO * r &&
      lowerShadow(i) <= SMALL_SHADOW_RANGE_RATIO * r;
    if (!longLower && !longUpper) continue;

    if (longLower && downtrendInto(i)) push('hammer', i, lows[i]);
    else if (longLower && uptrendInto(i)) push('hanging_man', i, highs[i]);
    else if (longUpper && downtrendInto(i)) push('inverted_hammer', i, lows[i]);
    else if (longUpper && uptrendInto(i)) push('shooting_star', i, highs[i]);
    else if (longLower && isLocalLow(i)) push('pin_bar_lower', i, lows[i]);
    else if (longUpper && isLocalHigh(i)) push('pin_bar_upper', i, highs[i]);
  }

  for (let i = 0; i < n; i++) {
    if (!validBar(i)) continue;
    const r = range(i);
    const b = body(i);
    if (r <= 0) continue;
    const ab = avgBody(i);
    if (ab <= 0) continue;
    if (b < MARUBOZU_BODY_RANGE_RATIO * r || b < MARUBOZU_BODY_AVG_RATIO * ab) continue;

    if (green(i)) push('bullish_marubozu', i, lows[i]);
    else if (red(i)) push('bearish_marubozu', i, highs[i]);
  }

  return out.sort((a, b) => a.time - b.time);
}
