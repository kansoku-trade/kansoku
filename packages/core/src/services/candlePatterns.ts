import type { CandlePattern, CandlePatternKind } from "@kansoku/shared/types";

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

export const CANDLE_PATTERN_META: Record<
  CandlePatternKind,
  { label: string; bias: "bullish" | "bearish" | "neutral"; strong: boolean; implication: string }
> = {
  bullish_engulfing: {
    label: "看涨吞没",
    bias: "bullish",
    strong: true,
    implication: "下跌后阳线实体完全吞没前一根阴线——买方接管，短线反转向上信号；下一根不破吞没线低点则有效",
  },
  bearish_engulfing: {
    label: "看跌吞没",
    bias: "bearish",
    strong: true,
    implication: "上涨后阴线实体完全吞没前一根阳线——卖方接管，短线反转向下信号；下一根不破吞没线高点则有效",
  },
  morning_star: {
    label: "启明星",
    bias: "bullish",
    strong: true,
    implication: "大阴线 + 小实体星线驻底 + 大阳线收复过半——经典三根 K 线底部反转组合，比单根信号更可靠",
  },
  evening_star: {
    label: "黄昏星",
    bias: "bearish",
    strong: true,
    implication: "大阳线 + 小实体星线滞涨 + 大阴线跌破过半——经典三根 K 线顶部反转组合，比单根信号更可靠",
  },
  hammer: {
    label: "锤子线",
    bias: "bullish",
    strong: false,
    implication: "下跌末端长下影小实体——低位被买盘拉回，止跌信号；下一根收在锤子实体上方则确认",
  },
  hanging_man: {
    label: "上吊线",
    bias: "bearish",
    strong: false,
    implication: "上涨末端出现长下影小实体——盘中曾被大幅打压，多头开始不稳的警示；跌破其低点则确认转弱",
  },
  inverted_hammer: {
    label: "倒锤子",
    bias: "bullish",
    strong: false,
    implication: "下跌末端长上影小实体——买方开始试探性上攻，反转苗头；需下一根阳线确认，可靠性低于锤子线",
  },
  shooting_star: {
    label: "射击之星",
    bias: "bearish",
    strong: false,
    implication: "上涨末端长上影小实体——冲高被抛压砸回，见顶警示；跌破其低点则确认",
  },
  pin_bar_lower: {
    label: "下影针线",
    bias: "bullish",
    strong: false,
    implication: "横盘中扎出局部新低的长下影小实体——区间下沿被买盘拒绝；无趋势背景，强度低于锤子线，需下一根收在实体上方确认",
  },
  pin_bar_upper: {
    label: "上影针线",
    bias: "bearish",
    strong: false,
    implication: "横盘中冲出局部新高的长上影小实体——区间上沿被抛压拒绝；无趋势背景，强度低于射击之星，需下一根收在实体下方确认",
  },
  dark_cloud_cover: {
    label: "乌云盖顶",
    bias: "bearish",
    strong: false,
    implication: "阴线高开后深入前一根阳线实体过半——上攻动能被吞噬，看跌反转信号，强度略弱于看跌吞没",
  },
  piercing_line: {
    label: "刺透形态",
    bias: "bullish",
    strong: false,
    implication: "阳线低开后收复前一根阴线实体过半——买方强力反击，看涨反转信号，强度略弱于看涨吞没",
  },
  bullish_harami: {
    label: "看涨孕线",
    bias: "bullish",
    strong: false,
    implication: "大阴线后小实体完全孕于其中——抛压衰竭的警示信号，方向未定，需后续阳线确认后才可信",
  },
  bearish_harami: {
    label: "看跌孕线",
    bias: "bearish",
    strong: false,
    implication: "大阳线后小实体完全孕于其中——买盘衰竭的警示信号，方向未定，需后续阴线确认后才可信",
  },
  three_white_soldiers: {
    label: "红三兵",
    bias: "bullish",
    strong: true,
    implication: "连续三根步步高的中大阳线——买方持续控盘，底部反转或强势延续；若出现在大涨后高位则谨防力竭",
  },
  three_black_crows: {
    label: "三只乌鸦",
    bias: "bearish",
    strong: true,
    implication: "连续三根步步低的中大阴线——卖方持续控盘，顶部反转或弱势延续信号，杀伤力大",
  },
  doji: {
    label: "十字星",
    bias: "neutral",
    strong: false,
    implication: "开盘收盘几乎持平——多空力量暂时均衡，方向未定，需看下一根确认走向",
  },
  long_legged_doji: {
    label: "长腿十字",
    bias: "neutral",
    strong: false,
    implication: "上下影线都很长但开收几乎持平——盘中剧烈拉锯却收平，分歧加剧的信号，方向未定",
  },
  gravestone_doji: {
    label: "墓碑十字",
    bias: "bearish",
    strong: false,
    implication: "上涨末端冲高后又跌回开盘价附近——上攻力量被完全抛压吞噬，见顶警示；跌破其低点则确认转弱",
  },
  dragonfly_doji: {
    label: "蜻蜓十字",
    bias: "bullish",
    strong: false,
    implication: "下跌末端探底后又收回开盘价附近——抛压被买盘完全接住，止跌信号；下一根收在高点上方则确认",
  },
  tweezer_top: {
    label: "镊子顶",
    bias: "bearish",
    strong: false,
    implication: "上涨末端连续两根 K 线在几乎同一高点受阻——同一价位反复被抛压压制，见顶警示；跌破前一根低点则确认",
  },
  tweezer_bottom: {
    label: "镊子底",
    bias: "bullish",
    strong: false,
    implication: "下跌末端连续两根 K 线在几乎同一低点获支撑——同一价位反复被买盘接住，止跌信号；突破前一根高点则确认",
  },
  bullish_marubozu: {
    label: "光头大阳",
    bias: "bullish",
    strong: false,
    implication: "开盘即最低、收盘即最高的大阳实体——买方全程控盘无回撤，强势信号；次日低开或收阴则转弱",
  },
  bearish_marubozu: {
    label: "光头大阴",
    bias: "bearish",
    strong: false,
    implication: "开盘即最高、收盘即最低的大阴实体——卖方全程控盘无反抽，弱势信号；次日高开或收阳则转弱",
  },
};

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

  const trendInto = (s: number, direction: "down" | "up") => {
    if (s < TREND_LOOKBACK) return false;
    const from = s - TREND_LOOKBACK;
    const to = s - 1;
    const ab = avgBody(s);
    if (ab <= 0) return false;

    let directionalSteps = 0;
    for (let j = from + 1; j <= to; j++) {
      if (!validBar(j - 1) || !validBar(j)) return false;
      if (direction === "down" ? closes[j] < closes[j - 1] : closes[j] > closes[j - 1]) directionalSteps += 1;
    }

    const net = closes[to] - closes[from];
    return direction === "down"
      ? net <= -TREND_MIN_BODY_RATIO * ab && directionalSteps >= TREND_MIN_DIRECTIONAL_STEPS
      : net >= TREND_MIN_BODY_RATIO * ab && directionalSteps >= TREND_MIN_DIRECTIONAL_STEPS;
  };
  const downtrendInto = (s: number) => trendInto(s, "down");
  const uptrendInto = (s: number) => trendInto(s, "up");
  const opensInsidePreviousBody = (i: number) => opens[i] > bodyBottom(i - 1) && opens[i] < bodyTop(i - 1);
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
    if (meta.bias === "bullish") {
      confirm_price = bodyTop(i);
      invalidate_price = spanLow;
    } else if (meta.bias === "bearish") {
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
      push("morning_star", i, lows[i - 1], 3);
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
      push("evening_star", i, highs[i - 1], 3);
    }
  }

  for (let i = 2; i < n; i++) {
    if (taken.get(i - 1) === "three_white_soldiers" || taken.get(i - 1) === "three_black_crows") continue;
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
      push("three_white_soldiers", i, lows[i - 2], 3);
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
      push("three_black_crows", i, highs[i - 2], 3);
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
      push("bullish_engulfing", i, lows[i], 2);
    } else if (
      bB > bA &&
      bB >= MIN_BODY_RATIO * ab &&
      green(i - 1) &&
      red(i) &&
      opens[i] >= closes[i - 1] &&
      closes[i] <= opens[i - 1] &&
      uptrendInto(i - 1)
    ) {
      push("bearish_engulfing", i, highs[i], 2);
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
      push("dark_cloud_cover", i, highs[i], 2);
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
      push("piercing_line", i, lows[i], 2);
    } else if (
      red(i - 1) &&
      green(i) &&
      bA >= ab &&
      bB <= HARAMI_BODY_RATIO * bA &&
      bodyTop(i) <= opens[i - 1] &&
      bodyBottom(i) >= closes[i - 1] &&
      downtrendInto(i - 1)
    ) {
      push("bullish_harami", i, lows[i], 2);
    } else if (
      green(i - 1) &&
      red(i) &&
      bA >= ab &&
      bB <= HARAMI_BODY_RATIO * bA &&
      bodyTop(i) <= closes[i - 1] &&
      bodyBottom(i) >= opens[i - 1] &&
      uptrendInto(i - 1)
    ) {
      push("bearish_harami", i, highs[i], 2);
    } else {
      const ar = avgRange(i);
      if (
        ar > 0 &&
        uptrendInto(i - 1) &&
        green(i - 1) &&
        red(i) &&
        Math.abs(highs[i] - highs[i - 1]) <= TWEEZER_TOLERANCE_RANGE_RATIO * ar
      ) {
        push("tweezer_top", i, Math.max(highs[i], highs[i - 1]), 2);
      } else if (
        ar > 0 &&
        downtrendInto(i - 1) &&
        red(i - 1) &&
        green(i) &&
        Math.abs(lows[i] - lows[i - 1]) <= TWEEZER_TOLERANCE_RANGE_RATIO * ar
      ) {
        push("tweezer_bottom", i, Math.min(lows[i], lows[i - 1]), 2);
      }
    }
  }

  for (let i = 1; i < n; i++) {
    if (!validBar(i)) continue;
    const r = range(i);
    const b = body(i);
    if (r <= 0) continue;

    if (uptrendInto(i) || downtrendInto(i)) {
      if (b <= DOJI_BODY_RANGE_RATIO * r) {
        if (upperShadow(i) >= DOJI_LONG_SHADOW_RANGE_RATIO * r && uptrendInto(i)) {
          push("gravestone_doji", i, highs[i]);
          continue;
        } else if (lowerShadow(i) >= DOJI_LONG_SHADOW_RANGE_RATIO * r && downtrendInto(i)) {
          push("dragonfly_doji", i, lows[i]);
          continue;
        } else if (
          upperShadow(i) >= DOJI_LEGGED_SHADOW_RANGE_RATIO * r &&
          lowerShadow(i) >= DOJI_LEGGED_SHADOW_RANGE_RATIO * r
        ) {
          push("long_legged_doji", i, closes[i]);
          continue;
        } else {
          push("doji", i, closes[i]);
          continue;
        }
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

    if (longLower && downtrendInto(i)) push("hammer", i, lows[i]);
    else if (longLower && uptrendInto(i)) push("hanging_man", i, highs[i]);
    else if (longUpper && downtrendInto(i)) push("inverted_hammer", i, lows[i]);
    else if (longUpper && uptrendInto(i)) push("shooting_star", i, highs[i]);
    else if (longLower && isLocalLow(i)) push("pin_bar_lower", i, lows[i]);
    else if (longUpper && isLocalHigh(i)) push("pin_bar_upper", i, highs[i]);
  }

  for (let i = 0; i < n; i++) {
    if (!validBar(i)) continue;
    const r = range(i);
    const b = body(i);
    if (r <= 0) continue;
    const ab = avgBody(i);
    if (ab <= 0) continue;
    if (b < MARUBOZU_BODY_RANGE_RATIO * r || b < MARUBOZU_BODY_AVG_RATIO * ab) continue;

    if (green(i)) push("bullish_marubozu", i, lows[i]);
    else if (red(i)) push("bearish_marubozu", i, highs[i]);
  }

  return out.sort((a, b) => a.time - b.time);
}
