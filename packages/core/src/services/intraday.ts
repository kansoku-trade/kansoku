import {
  AUTO_SIGNAL_META,
  type CandlePattern,
  type CandlePatternStatus,
  type ColoredPoint,
  type Connector,
  type DivergencePair,
  type DivergencePoint,
  type EmaLine,
  type EntryPlanStatus,
  type IntradayBuilt,
  type IntradayContext,
  type IntradayEventRisk,
  type IntradayOptionsLevels,
  type IntradayEntryPlan,
  type IntradayFvgZone,
  type IntradayPriceZone,
  type IntradayPrediction,
  type IntradayTargetContext,
  type IntradayTfData,
  type IntradayTfSummary,
  type MacdCross,
  type MarkerPosition,
  type MarkerShape,
  type NewsItem,
  type Pattern123,
  type PredictionScenario,
  type RawBar,
  type SeriesMarker,
  type SwingPoint,
  type TimeframeKey,
} from "@kansoku/shared/types";
import { formatMarketMonthDayTime } from "@kansoku/shared/time";
import { ClientError } from "../errors.js";
import { detectCandlePatterns } from "./candlePatterns.js";
import { buildDayContext } from "./dayLevels.js";
import { detectFvgZones } from "./fvg.js";
import { lastVwap, sessionVwap } from "./vwap.js";
import { ema, findSwings, lineData, macd, pyRound, sma, toTs } from "./indicators.js";
import { classifyMacdStructure, MACD_STRUCTURE_META, ZERO_TANGLE_NOTE, type MacdStructure } from "./macdStructure.js";
import { detect123Patterns } from "./pattern123.js";
import { enrichCandlePatterns, offSessionSignalKeeper, SCORE_DOT_MARKER, SCORE_FULL_MARKER } from "./patternScoring.js";
import { offSessionSegments } from "./session.js";
import { marketOf } from "./symbol.utils.js";

export const TIMEFRAME_ORDER: TimeframeKey[] = ["m5", "m15", "h1"];
export const TIMEFRAME_LABELS: Record<TimeframeKey, string> = { m5: "5分钟", m15: "15分钟", h1: "1小时" };
export const DEFAULT_EMA_PERIODS = [9, 21, 55];
const MACD_MIN_BARS = 60;
const SIGNAL_ICON: Record<string, string> = { pin_bar: "📌", macd_divergence: "⚡", macd_beichi: "🌀" };
const BEICHI_WEAKER_RATIO = 0.9;
const MIN_PUSH_BARS = 3;
const ZONE_COLORS: Record<string, string> = {
  entry: "#58a6ff",
  stop: "#ef5350",
  target: "#26a69a",
  support: "#26a69a",
  resistance: "#ffb74d",
  invalidation: "#ef5350",
  watch: "#8b949e",
};
const BIAS_MARKER_STYLE: Record<
  "bullish" | "bearish" | "neutral",
  { position: MarkerPosition; color: string; shape: MarkerShape }
> = {
  bullish: { position: "belowBar", color: "#26a69a", shape: "arrowUp" },
  bearish: { position: "aboveBar", color: "#ef5350", shape: "arrowDown" },
  neutral: { position: "inBar", color: "#9e9e9e", shape: "circle" },
};
const SIGNAL_BIAS_STYLE: Record<"bullish" | "bearish" | "neutral", { color: string; shape: MarkerShape }> = {
  bullish: { color: "#26a69a", shape: "arrowUp" },
  bearish: { color: "#ef5350", shape: "arrowDown" },
  neutral: { color: "#ffc107", shape: "circle" },
};
const ANCHOR_DIRECTION_STYLE: Record<
  "long" | "short" | "neutral",
  { label: string; shape: MarkerShape; position: MarkerPosition }
> = {
  long: { label: "做多", shape: "arrowUp", position: "belowBar" },
  short: { label: "做空", shape: "arrowDown", position: "aboveBar" },
  neutral: { label: "观望", shape: "circle", position: "inBar" },
};
const PATTERN_STATUS_TEXT: Record<CandlePatternStatus, string> = {
  pending: "待确认",
  confirmed: "✓已确认",
  invalidated: "✗已失效",
  expired: "已过期（3根内未触发确认或失效）",
};
const PATTERN_LABEL_SUFFIX: Partial<Record<CandlePatternStatus, string>> = { pending: "?", confirmed: "✓" };
const ENTRY_STATUS_NOTES: Record<Exclude<EntryPlanStatus, "waiting">, string> = {
  triggered: "已触发入场，止损/目标价位生效",
  invalidated: "未触发入场，价格已朝止损方向走破入场-止损中线——计划失效，需重估",
  stopped: "入场后触及止损，计划已了结",
};

export function resolveEntryPlanStatus(
  plan: Pick<IntradayEntryPlan, "entry" | "stop">,
  direction: "long" | "short" | "neutral",
  anchorTs: number | null,
  candles: { time: number; high: number; low: number; close: number }[],
): { status: EntryPlanStatus; note: string | null } | null {
  if (direction === "neutral" || anchorTs === null) return null;
  const midpoint = (plan.entry + plan.stop) / 2;
  const towardStop = (c: { low: number; high: number; close: number }) =>
    direction === "long" ? c.low <= plan.stop || c.close <= midpoint : c.high >= plan.stop || c.close >= midpoint;
  const touchesEntry = (c: { low: number; high: number }) => c.low <= plan.entry && plan.entry <= c.high;
  const hitsStop = (c: { low: number; high: number }) =>
    direction === "long" ? c.low <= plan.stop : c.high >= plan.stop;

  let triggered = false;
  for (const c of candles) {
    if (c.time < anchorTs) continue;
    if (!triggered) {
      if (touchesEntry(c)) triggered = true;
      else if (towardStop(c)) return { status: "invalidated", note: ENTRY_STATUS_NOTES.invalidated };
    } else if (hitsStop(c)) {
      return { status: "stopped", note: ENTRY_STATUS_NOTES.stopped };
    }
  }
  if (triggered) return { status: "triggered", note: ENTRY_STATUS_NOTES.triggered };
  return { status: "waiting", note: null };
}

const barTimeShort = (t: number) => formatMarketMonthDayTime(t, true);

export function findMacdCrosses(hist: (number | null)[], timesTs: number[]): MacdCross[] {
  const out: MacdCross[] = [];
  let prev: number | null = null;
  for (let i = 0; i < hist.length; i++) {
    const h = hist[i];
    if (h === null) continue;
    if (prev !== null) {
      if (prev <= 0 && h > 0) out.push({ time: timesTs[i], type: "golden" });
      else if (prev >= 0 && h < 0) out.push({ time: timesTs[i], type: "death" });
    }
    prev = h;
  }
  return out;
}

export function findPriceDivergence(swingPoints: DivergencePoint[], isHigh: boolean): DivergencePair[] {
  const out: DivergencePair[] = [];
  for (let i = 0; i + 1 < swingPoints.length; i++) {
    const a = swingPoints[i];
    const b = swingPoints[i + 1];
    if (isHigh && b.price > a.price && b.macd_value < a.macd_value) {
      out.push({ kind: "top", a, b });
    } else if (!isHigh && b.price < a.price && b.macd_value > a.macd_value) {
      out.push({ kind: "bottom", a, b });
    }
  }
  return out;
}

interface Push {
  start: number;
  end: number;
  sign: 1 | -1;
}

export function macdPushes(hist: (number | null)[]): Push[] {
  const pushes: Push[] = [];
  let i = 0;
  const n = hist.length;
  while (i < n) {
    const h = hist[i];
    if (h === null || h === 0) {
      i += 1;
      continue;
    }
    const sign = h > 0 ? 1 : -1;
    let j = i;
    while (j < n) {
      const hj = hist[j];
      if (hj === null || (sign > 0 ? hj <= 0 : hj >= 0)) break;
      j += 1;
    }
    if (j - i >= MIN_PUSH_BARS) pushes.push({ start: i, end: j - 1, sign });
    i = j > i ? j : i + 1;
  }
  return pushes;
}

export function findMacdBeichi(
  hist: (number | null)[],
  highs: number[],
  lows: number[],
  timesTs: number[],
): DivergencePair[] {
  const pushes = macdPushes(hist);
  const out: DivergencePair[] = [];
  const area = (p: Push) => {
    let s = 0;
    for (let j = p.start; j <= p.end; j++) s += Math.abs(hist[j] ?? 0);
    return s;
  };
  const argExtreme = (p: Push, arr: number[], isMax: boolean) => {
    let best = p.start;
    for (let j = p.start + 1; j <= p.end; j++) {
      if (isMax ? arr[j] > arr[best] : arr[j] < arr[best]) best = j;
    }
    return best;
  };
  for (let k = 2; k < pushes.length; k++) {
    const prev = pushes[k - 2];
    const curr = pushes[k];
    if (prev.sign !== curr.sign) continue;
    if (area(curr) >= area(prev) * BEICHI_WEAKER_RATIO) continue;
    let kind: "top" | "bottom";
    let prevI: number;
    let currI: number;
    let prevPrice: number;
    let currPrice: number;
    if (curr.sign > 0) {
      prevI = argExtreme(prev, highs, true);
      currI = argExtreme(curr, highs, true);
      if (highs[currI] <= highs[prevI]) continue;
      kind = "top";
      prevPrice = highs[prevI];
      currPrice = highs[currI];
    } else {
      prevI = argExtreme(prev, lows, false);
      currI = argExtreme(curr, lows, false);
      if (lows[currI] >= lows[prevI]) continue;
      kind = "bottom";
      prevPrice = lows[prevI];
      currPrice = lows[currI];
    }
    out.push({
      kind,
      a: { time: timesTs[prevI], price: prevPrice, macd_value: hist[prevI] as number },
      b: { time: timesTs[currI], price: currPrice, macd_value: hist[currI] as number },
    });
  }
  return out;
}

const VWAP_TIMEFRAMES = new Set<string>(["m5", "m15"]);

export interface CoercedTimeframe {
  candles: IntradayTfData["candles"];
  volumes: ColoredPoint[];
  emas: EmaLine[];
  vwap: IntradayTfData["vwap"];
  macdDif: IntradayTfData["macdDif"];
  macdDea: IntradayTfData["macdDea"];
  macdHist: ColoredPoint[];
  macdCrosses: MacdCross[];
  structure: MacdStructure;
  candlePatterns: CandlePattern[];
  autoDivergence: DivergencePair[];
  autoBeichi: DivergencePair[];
  pattern123: Pattern123[];
  fvgZones: IntradayFvgZone[];
  lastClose: number;
  summary: IntradayTfSummary;
}

export function sanitizeEmaPeriods(raw: unknown): number[] {
  if (!Array.isArray(raw)) return DEFAULT_EMA_PERIODS;
  const periods = raw
    .map((p) => Math.trunc(Number(p)))
    .filter((p) => Number.isFinite(p) && p >= 2 && p <= 250)
    .slice(0, 4);
  return periods.length ? periods : DEFAULT_EMA_PERIODS;
}

export function coerceIntradayTimeframe(bars: RawBar[], key: string, emaPeriods = DEFAULT_EMA_PERIODS): CoercedTimeframe {
  if (!bars || bars.length < MACD_MIN_BARS) {
    throw new ClientError(
      `intraday: timeframe '${key}' needs at least ${MACD_MIN_BARS} bars (got ${bars?.length ?? 0}); ` +
        "MACD(12,26,9) needs slow+signal warm-up plus history for swing detection.",
      `Pull more history: \`longbridge kline <SYM> --period ${key} --count 1000 --format json\`.`,
    );
  }
  const timesTs = bars.map((b) => toTs(b.time));
  const opens = bars.map((b) => Number(b.open));
  const highs = bars.map((b) => Number(b.high));
  const lows = bars.map((b) => Number(b.low));
  const closes = bars.map((b) => Number(b.close));
  const vols = bars.map((b) => Number(b.volume));

  const { dif, dea, hist } = macd(closes);
  const vol20 = sma(vols, 20);
  const emaArrs = emaPeriods.map((p) => ({ period: p, arr: ema(closes, p) }));

  const candles = timesTs.map((t, i) => ({ time: t, open: opens[i], high: highs[i], low: lows[i], close: closes[i] }));
  const volumes: ColoredPoint[] = timesTs.map((t, i) => {
    let color = closes[i] >= opens[i] ? "#26a69a" : "#ef5350";
    const v20 = vol20[i];
    if (v20 !== null && vols[i] >= 1.5 * v20) color = "#ff5722";
    return { time: t, value: vols[i], color };
  });

  const histBars: ColoredPoint[] = [];
  for (let i = 0; i < timesTs.length; i++) {
    const h = hist[i];
    if (h === null) continue;
    histBars.push({ time: timesTs[i], value: h, color: h >= 0 ? "#26a69a" : "#ef5350" });
  }

  const { swingHighs, swingLows } = findSwings(highs, lows, timesTs);
  const lastNonNull = (arr: (number | null)[]) => {
    for (let i = arr.length - 1; i >= 0; i--) if (arr[i] !== null) return arr[i];
    return null;
  };

  const vwap = VWAP_TIMEFRAMES.has(key) ? sessionVwap(bars) : undefined;
  const macdCrosses = findMacdCrosses(hist, timesTs);
  const structure = classifyMacdStructure(dif, hist, timesTs);
  const fvgZones = detectFvgZones(candles);
  const candlePatterns = enrichCandlePatterns(detectCandlePatterns(opens, highs, lows, closes, timesTs), {
    highs,
    lows,
    closes,
    vols,
    timesTs,
    emaArrs,
    swingHighs,
    swingLows,
    fvgZones,
  });

  const histByTime = new Map<number, number>();
  for (let i = 0; i < hist.length; i++) {
    const h = hist[i];
    if (h !== null) histByTime.set(timesTs[i], h);
  }
  const withMacd = (pts: { time: number; price: number }[]): DivergencePoint[] =>
    pts.filter((p) => histByTime.has(p.time)).map((p) => ({ ...p, macd_value: histByTime.get(p.time) as number }));

  const keepSignal = offSessionSignalKeeper(timesTs, vols);
  const autoDivergence = [
    ...findPriceDivergence(withMacd(swingHighs), true),
    ...findPriceDivergence(withMacd(swingLows), false),
  ]
    .filter((d) => keepSignal(d.b.time))
    .sort((a, b) => a.b.time - b.b.time);
  const autoBeichi = findMacdBeichi(hist, highs, lows, timesTs)
    .filter((d) => keepSignal(d.b.time))
    .sort((a, b) => a.b.time - b.b.time);
  const pattern123 = detect123Patterns(highs, lows, closes, timesTs)
    .filter((p) => keepSignal(p.confirm?.time ?? p.p3.time))
    .slice(-2);
  structure.signals = structure.signals.filter((s) => keepSignal(s.time));

  return {
    candles,
    volumes,
    emas: emaArrs.map(({ period, arr }) => ({ period, data: lineData(timesTs, arr) })),
    vwap,
    macdDif: lineData(timesTs, dif),
    macdDea: lineData(timesTs, dea),
    macdHist: histBars,
    macdCrosses,
    structure,
    candlePatterns,
    autoDivergence: autoDivergence.slice(-2),
    autoBeichi: autoBeichi.slice(-2),
    pattern123,
    fvgZones,
    lastClose: closes[closes.length - 1],
    summary: {
      last_dif: lastNonNull(dif),
      last_dea: lastNonNull(dea),
      last_hist: lastNonNull(hist),
      last_vwap: vwap ? lastVwap(vwap) : null,
      emas: emaArrs.map(({ period, arr }) => ({ period, last: lastNonNull(arr) })),
      recent_swing_highs: swingHighs.slice(-6),
      recent_swing_lows: swingLows.slice(-6),
      last_cross: macdCrosses.length ? macdCrosses[macdCrosses.length - 1] : null,
      divergence_candidates: autoDivergence.slice(-3),
      beichi_candidates: autoBeichi.slice(-3),
      structure_signals: structure.signals.slice(-6),
      zero_tangle: structure.tangle,
      candle_patterns: candlePatterns.slice(-6),
      pattern_123: pattern123,
    },
  };
}

interface TfOverlay {
  markers: SeriesMarker[];
  priceConnectors: Connector[];
  macdConnectors: Connector[];
}

function buildIntradaySignals(signals: IntradayPrediction["signals"]): Record<TimeframeKey, TfOverlay> {
  const perTf = Object.fromEntries(
    TIMEFRAME_ORDER.map((k) => [k, { markers: [], priceConnectors: [], macdConnectors: [] } as TfOverlay]),
  ) as Record<TimeframeKey, TfOverlay>;
  for (const sig of signals ?? []) {
    const tf = sig.timeframe;
    if (!tf || !(tf in perTf)) continue;
    const stype = sig.type ?? sig.kind ?? "other";
    const bias = sig.bias;
    const { color, shape } = SIGNAL_BIAS_STYLE[bias ?? "neutral"];

    const tooltip = `${SIGNAL_ICON[stype] ?? "•"} AI 标注信号\n${sig.label ?? stype}`;
    if (stype === "macd_divergence") {
      const points = sig.points ?? [];
      for (const p of points) {
        perTf[tf].markers.push({
          time: toTs(p.time),
          position: bias === "bullish" ? "belowBar" : "aboveBar",
          color,
          shape,
          text: SIGNAL_ICON[stype] ?? "•",
          tooltip,
          group: "ai",
        });
      }
      if (points.length === 2) {
        perTf[tf].priceConnectors.push({
          color,
          group: "ai",
          data: [
            { time: toTs(points[0].time), value: Number(points[0].price) },
            { time: toTs(points[1].time), value: Number(points[1].price) },
          ],
        });
        if (points[0].macd_value != null && points[1].macd_value != null) {
          perTf[tf].macdConnectors.push({
            color,
            group: "ai",
            data: [
              { time: toTs(points[0].time), value: Number(points[0].macd_value) },
              { time: toTs(points[1].time), value: Number(points[1].macd_value) },
            ],
          });
        }
      }
    } else {
      if (sig.time == null) continue;
      perTf[tf].markers.push({
        time: toTs(sig.time),
        position: bias === "bullish" ? "belowBar" : "aboveBar",
        color,
        shape,
        text: SIGNAL_ICON[stype] ?? "•",
        tooltip,
        group: "ai",
      });
    }
  }
  return perTf;
}

const MARKER_GROUP_RANK: Record<string, number> = { ai: 0, divergence: 1, beichi: 2, pattern123: 3, candle: 4 };
const MAX_MARKERS_PER_BAR = 2;
const AI_AUTO_MERGE_BAR_WINDOW = 2;

const AI_ICON_TO_AUTO_GROUP: Record<string, "divergence" | "beichi"> = {
  [SIGNAL_ICON.macd_divergence]: "divergence",
  [SIGNAL_ICON.macd_beichi]: "beichi",
};

export function mergeAiAutoMarkers(
  aiMarkers: SeriesMarker[],
  autoMarkers: SeriesMarker[],
  barIndex: Map<number, number>,
): SeriesMarker[] {
  const merged = aiMarkers.map((m) => ({ ...m }));
  const kept: SeriesMarker[] = [];
  for (const auto of autoMarkers) {
    const autoIdx = barIndex.get(auto.time);
    const near =
      autoIdx === undefined
        ? undefined
        : merged.find((ai) => {
            if (!ai.text || AI_ICON_TO_AUTO_GROUP[ai.text] !== auto.group) return false;
            const aiIdx = barIndex.get(ai.time);
            return aiIdx !== undefined && Math.abs(aiIdx - autoIdx) <= AI_AUTO_MERGE_BAR_WINDOW;
          });
    if (!near) {
      kept.push(auto);
      continue;
    }
    const autoTitle = auto.tooltip?.split("\n")[0]?.replace(/（[^）]*）/g, "");
    const note = autoTitle ? `✓ 自动检测同步确认（${autoTitle}）` : null;
    if (note && !near.tooltip?.includes(note)) near.tooltip = `${near.tooltip}\n${note}`;
  }
  return [...merged, ...kept];
}

export function capMarkersPerBar(markers: SeriesMarker[], cap = MAX_MARKERS_PER_BAR): SeriesMarker[] {
  const bySlot = new Map<string, SeriesMarker>();
  const deduped: SeriesMarker[] = [];
  for (const m of markers) {
    const slot = `${m.time}|${m.group ?? ""}|${m.text ?? ""}`;
    const prev = bySlot.get(slot);
    if (!prev) {
      const copy = { ...m };
      bySlot.set(slot, copy);
      deduped.push(copy);
    } else if (m.tooltip && prev.tooltip !== m.tooltip && !prev.tooltip?.includes(m.tooltip)) {
      prev.tooltip = `${prev.tooltip}\n———\n${m.tooltip}`;
    }
  }
  const byTime = new Map<number, SeriesMarker[]>();
  for (const m of deduped) {
    const list = byTime.get(m.time);
    if (list) list.push(m);
    else byTime.set(m.time, [m]);
  }
  const out: SeriesMarker[] = [];
  for (const group of byTime.values()) {
    if (group.length <= cap) {
      out.push(...group);
      continue;
    }
    const ranked = [...group].sort(
      (a, b) => (MARKER_GROUP_RANK[a.group ?? ""] ?? 9) - (MARKER_GROUP_RANK[b.group ?? ""] ?? 9),
    );
    const keep = ranked.slice(0, cap).map((m) => ({ ...m }));
    const dropped = ranked
      .slice(cap)
      .map((m) => m.tooltip?.split("\n")[0])
      .filter((t): t is string => Boolean(t));
    if (dropped.length) {
      const last = keep[keep.length - 1];
      last.tooltip = `${last.tooltip}\n———\n本根另有：${dropped.join("；")}`;
    }
    out.push(...keep);
  }
  return out.sort((a, b) => a.time - b.time);
}

function autoPatternMarkers(items: DivergencePair[], group: "divergence" | "beichi", color: string): TfOverlay {
  const markers: SeriesMarker[] = [];
  const priceConnectors: Connector[] = [];
  const macdConnectors: Connector[] = [];
  for (const it of items) {
    const { a, b } = it;
    const meta = AUTO_SIGNAL_META[`${group}-${it.kind}`];
    const position = it.kind === "top" ? "aboveBar" : "belowBar";
    const tooltip =
      `${meta.icon} 自动·${meta.title}（简化算法，仅供参考）\n` +
      `${barTimeShort(a.time)} $${a.price} → ${barTimeShort(b.time)} $${b.price}\n` +
      meta.impact;
    for (const p of [a, b]) {
      markers.push({ time: p.time, position, color, shape: "circle", text: "", tooltip, group });
    }
    priceConnectors.push({
      color,
      group,
      data: [
        { time: a.time, value: a.price },
        { time: b.time, value: b.price },
      ],
    });
    macdConnectors.push({
      color,
      group,
      data: [
        { time: a.time, value: a.macd_value },
        { time: b.time, value: b.macd_value },
      ],
    });
  }
  return { markers, priceConnectors, macdConnectors };
}

function pattern123Overlay(patterns: Pattern123[], lastBarTime: number): TfOverlay {
  const markers: SeriesMarker[] = [];
  const priceConnectors: Connector[] = [];
  for (const pat of patterns) {
    const bullish = pat.kind === "bullish";
    const color = bullish ? "#26a69a" : "#ef5350";
    const breakVerb = bullish ? "站上" : "跌破";
    const statusText = pat.confirm
      ? `已于 ${barTimeShort(pat.confirm.time)} 收盘${breakVerb} ②，结构确认`
      : `酝酿中：等待收盘${breakVerb} ② $${pat.trigger.toFixed(2)}`;
    const tooltip =
      `🔢 自动·${pat.label}（简化算法，仅供参考）\n` +
      `① ${barTimeShort(pat.p1.time)} $${pat.p1.price} → ② ${barTimeShort(pat.p2.time)} $${pat.p2.price} → ③ ${barTimeShort(pat.p3.time)} $${pat.p3.price}\n` +
      `${pat.implication}\n${statusText}`;
    const pts: [SwingPoint, string][] = [
      [pat.p1, "①"],
      [pat.p2, "②"],
      [pat.p3, "③"],
    ];
    for (const [p, text] of pts) {
      const isTrough = bullish !== (text === "②");
      markers.push({
        time: p.time,
        position: isTrough ? "belowBar" : "aboveBar",
        color,
        shape: "circle",
        text: pat.confirm || text !== "③" ? text : `${text}?`,
        tooltip,
        group: "pattern123",
      });
    }
    if (pat.confirm) {
      markers.push({
        time: pat.confirm.time,
        position: bullish ? "belowBar" : "aboveBar",
        color,
        shape: bullish ? "arrowUp" : "arrowDown",
        text: "123✓",
        tooltip: `🔢 123 结构确认\n${barTimeShort(pat.confirm.time)} 收盘 $${pat.confirm.price.toFixed(2)} ${breakVerb}触发线 $${pat.trigger.toFixed(2)}\n${pat.implication}`,
        group: "pattern123",
      });
    }
    priceConnectors.push({
      color,
      group: "pattern123",
      data: [
        { time: pat.p1.time, value: pat.p1.price },
        { time: pat.p2.time, value: pat.p2.price },
        { time: pat.p3.time, value: pat.p3.price },
      ],
    });
    const triggerEnd = pat.confirm ? pat.confirm.time : lastBarTime;
    if (triggerEnd > pat.p3.time) {
      priceConnectors.push({
        color,
        group: "pattern123",
        data: [
          { time: pat.p3.time, value: pat.trigger },
          { time: triggerEnd, value: pat.trigger },
        ],
      });
    }
  }
  return { markers, priceConnectors, macdConnectors: [] };
}

export function computeIntradayEntryPlan(
  raw: NonNullable<IntradayPrediction["entry_plan"]>,
  direction: string,
  extraZones: IntradayPrediction["price_zones"] = [],
): IntradayEntryPlan {
  const entry = Number(raw.entry);
  const stop = Number(raw.stop);
  const targetFromPct = (pct: number) => pyRound(direction === "short" ? entry * (1 - pct / 100) : entry * (1 + pct / 100), 4);
  const pctFromTarget = (target: number) => {
    if (!entry) return 0;
    const rawPct = direction === "short" ? ((entry - target) / entry) * 100 : ((target - entry) / entry) * 100;
    return pyRound(rawPct, 4);
  };
  const rawT1Pct = Number(raw.target1_pct ?? 3);
  const rawT2Pct = Number(raw.target2_pct ?? 6);
  const target1 = Number.isFinite(Number(raw.target1)) ? Number(raw.target1) : targetFromPct(rawT1Pct);
  const target2 = Number.isFinite(Number(raw.target2)) ? Number(raw.target2) : targetFromPct(rawT2Pct);
  const t1Pct = raw.target1 == null ? rawT1Pct : pctFromTarget(target1);
  const t2Pct = raw.target2 == null ? rawT2Pct : pctFromTarget(target2);
  let risk: number;
  let reward: number;
  if (direction === "short") {
    risk = stop - entry;
    reward = entry - target2;
  } else {
    risk = entry - stop;
    reward = target2 - entry;
  }
  const rr = risk > 0 ? reward / risk : 0;
  const entryZone = normalizePriceZone(raw.entry_zone, "entry", "入场参考");
  const targetContexts: IntradayTargetContext[] = [
    {
      key: "target1",
      label: raw.target1_label ?? "T1",
      price: target1,
      zone: normalizePriceZone(raw.target1_zone, "target", "T1 参考结构"),
      note: raw.target1_note,
      condition: raw.target1_condition,
    },
    {
      key: "target2",
      label: raw.target2_label ?? "T2",
      price: target2,
      zone: normalizePriceZone(raw.target2_zone, "target", "T2 参考结构"),
      note: raw.target2_note,
      condition: raw.target2_condition,
    },
  ];
  const priceZones = (extraZones ?? [])
    .map((z) => normalizePriceZone(z, z.kind ?? "watch", z.label ?? "压力/阻力区"))
    .filter((z): z is IntradayPriceZone => z?.kind === "resistance");
  return {
    entry,
    stop,
    target1,
    target1_pct: t1Pct,
    target2,
    target2_pct: t2Pct,
    rr,
    rr_ok: rr >= 2,
    rr_great: rr >= 3,
    note: raw.note ?? "",
    rationale: raw.rationale ?? "",
    stop_note: raw.stop_note ?? "",
    entry_zone: entryZone,
    target_contexts: targetContexts,
    price_zones: dedupeZones(priceZones),
  };
}

function normalizePriceZone(
  raw: Partial<IntradayPriceZone> | undefined,
  kind: IntradayPriceZone["kind"],
  fallbackLabel: string,
  fallbackPrice?: number,
): IntradayPriceZone | null {
  const low = Number(raw?.low ?? fallbackPrice);
  const high = Number(raw?.high ?? raw?.low ?? fallbackPrice);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  return {
    kind: raw?.kind ?? kind,
    label: raw?.label ?? fallbackLabel,
    low: pyRound(lo, 4),
    high: pyRound(hi, 4),
    note: raw?.note,
    source: raw?.source,
    sources: raw?.sources?.filter(Boolean) ?? (raw?.source ? [raw.source] : undefined),
    color: raw?.color ?? ZONE_COLORS[raw?.kind ?? kind] ?? ZONE_COLORS.watch,
  };
}

function dedupeZones(zones: IntradayPriceZone[]): IntradayPriceZone[] {
  const seen = new Set<string>();
  return zones.filter((z) => {
    const key = `${z.kind}:${z.label}:${z.low}:${z.high}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface IntradayInput {
  symbol: string;
  name?: string;
  as_of?: string;
  timeframes: Partial<Record<TimeframeKey, RawBar[]>>;
  day_kline?: RawBar[];
  ema_periods?: number[];
  news?: NewsItem[];
  position?: { shares?: number; cost?: number };
  prediction?: IntradayPrediction | null;
  context?: IntradayContext | null;
  options_levels?: IntradayOptionsLevels | null;
  event_risk?: IntradayEventRisk | null;
}

const CONTEXT_STANCES = new Set(["long", "short", "neutral"]);

function validateIntradayContext(context: IntradayContext): void {
  if (typeof context.generated_at !== "string" || !context.generated_at) {
    throw new ClientError(
      "intraday: context.generated_at must be a non-empty ISO timestamp string",
      'e.g. {"context": {"generated_at": "2026-07-05T14:00:00.000Z", ...}}',
    );
  }
  if (!CONTEXT_STANCES.has(context.conclusion?.stance)) {
    throw new ClientError(
      "intraday: context.conclusion.stance must be one of long | short | neutral",
      'e.g. {"conclusion": {"stance": "long", "summary": "...", "action": "..."}}',
    );
  }
  if (!Array.isArray(context.news)) {
    throw new ClientError("intraday: context.news must be an array (may be empty)");
  }
  if (!Array.isArray(context.sources_used)) {
    throw new ClientError("intraday: context.sources_used must be an array (may be empty)");
  }
}

function normalizeScenarios(raw: unknown): PredictionScenario[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.map((sc) => {
    const s = (sc && typeof sc === "object" ? sc : {}) as Record<string, unknown>;
    const label = typeof s.label === "string" ? s.label : typeof s.name === "string" ? s.name : "";
    let probability = 0;
    if (typeof s.probability === "number" && Number.isFinite(s.probability)) {
      probability = s.probability;
    } else if (typeof s.prob === "number" && Number.isFinite(s.prob)) {
      probability = s.prob;
    }
    if (probability > 0 && probability <= 1) probability = probability * 100;
    return {
      label,
      probability,
      path: typeof s.path === "string" ? s.path : undefined,
      trigger: typeof s.trigger === "string" ? s.trigger : undefined,
    };
  });
}

export interface IntradayMeta {
  mode: "prediction" | "preview";
  bars: Record<TimeframeKey, number>;
  technicals: Record<TimeframeKey, IntradayTfSummary>;
  [key: string]: unknown;
}

export function buildIntraday(input: IntradayInput): { built: IntradayBuilt; meta: IntradayMeta } {
  const symbol = input.symbol;
  if (!symbol) throw new ClientError("intraday: input.symbol is required");
  const name = input.name || symbol;
  const asOf = input.as_of ?? "";

  const tfRaw = input.timeframes ?? {};
  const missing = TIMEFRAME_ORDER.filter((k) => !(k in tfRaw));
  if (missing.length) {
    throw new ClientError(
      `intraday: missing timeframes [${missing.join(", ")}]; need all of [${TIMEFRAME_ORDER.join(", ")}].`,
      "Pull each with `longbridge kline <SYM> --period <5m|15m|1h> --count 1000 --format json`.",
    );
  }

  const context = input.context ?? null;
  if (context) validateIntradayContext(context);

  const prediction = input.prediction
    ? {
        ...input.prediction,
        range_bound_plan: input.prediction.range_bound_plan ?? input.prediction.range_plan,
        scenarios: normalizeScenarios(input.prediction.scenarios),
      }
    : null;
  const emaPeriods = sanitizeEmaPeriods(input.ema_periods);
  const tfs = Object.fromEntries(
    TIMEFRAME_ORDER.map((k) => [k, coerceIntradayTimeframe(tfRaw[k] as RawBar[], k, emaPeriods)]),
  ) as Record<TimeframeKey, CoercedTimeframe>;
  const last = tfs.m5.lastClose;

  const direction = prediction?.direction ?? "neutral";
  const anchor = prediction?.anchor;
  const signalsByTf = buildIntradaySignals(prediction?.signals);
  if (anchor && anchor.timeframe in signalsByTf) {
    const { label: dirLabel, shape, position } = ANCHOR_DIRECTION_STYLE[direction];
    signalsByTf[anchor.timeframe].markers.push({
      time: toTs(anchor.time),
      position,
      color: "#58a6ff",
      shape,
      text: `🎯 ${dirLabel}`,
      tooltip: `🎯 AI 预测锚点\n${TIMEFRAME_LABELS[anchor.timeframe]} · ${barTimeShort(toTs(anchor.time))} · $${Number(anchor.price).toFixed(2)}\n方向判断（${dirLabel}）基于这根 K 线做出`,
      group: "ai",
    });
  }

  const epRaw = prediction?.entry_plan;
  const entryPlan = epRaw?.entry && epRaw.stop ? computeIntradayEntryPlan(epRaw, direction, prediction?.price_zones) : null;
  if (entryPlan) {
    const st = resolveEntryPlanStatus(entryPlan, direction, anchor ? toTs(anchor.time) : null, tfs.m5.candles);
    entryPlan.entry_status = st?.status ?? null;
    entryPlan.entry_status_note = st?.note ?? null;
  }

  const timeframes = {} as Record<TimeframeKey, IntradayTfData>;
  for (const k of TIMEFRAME_ORDER) {
    const tf = tfs[k];
    const sig = signalsByTf[k];
    const autoDiv = autoPatternMarkers(tf.autoDivergence, "divergence", "#ab47bc");
    const autoBei = autoPatternMarkers(tf.autoBeichi, "beichi", "#ff8f00");
    const auto123 = pattern123Overlay(tf.pattern123, tf.candles[tf.candles.length - 1].time);
    const tangleSuffix = tf.structure.tangle ? `\n${ZERO_TANGLE_NOTE}` : "";
    const crossMarkers: SeriesMarker[] = tf.structure.signals.map((s, i) => {
      const meta = MACD_STRUCTURE_META[s.kind];
      const isZeroCross = s.kind === "zero_cross_up" || s.kind === "zero_cross_down";
      const pending = s.confirmed ? "" : "（最新 K 线，待确认）";
      return {
        time: s.time,
        position: "inBar",
        color: meta.color,
        shape: isZeroCross ? "square" : "circle",
        text: s.confirmed ? s.label : `${s.label}?`,
        id: `x-${i}`,
        tooltip: `${s.bias === "bullish" ? "🟢" : "🔴"} ${s.label} · ${barTimeShort(s.time)}${pending}\n${s.implication}${tangleSuffix}`,
      };
    });
    const barIndex = new Map(tf.candles.map((c, i) => [c.time, i]));
    const lastIdxByKind = new Map<CandlePattern["kind"], number>();
    const dedupedPatterns = tf.candlePatterns.filter((p) => {
      const idx = barIndex.get(p.time) ?? -1;
      const prevIdx = lastIdxByKind.get(p.kind);
      if (prevIdx !== undefined && idx - prevIdx <= 2) return false;
      lastIdxByKind.set(p.kind, idx);
      return true;
    });
    const patternMarkers: SeriesMarker[] = dedupedPatterns
      .filter((p) => (p.score ?? 0) >= SCORE_DOT_MARKER)
      .slice(-12)
      .map((p) => {
        const full = (p.score ?? 0) >= SCORE_FULL_MARKER;
        const dead = p.status === "invalidated" || p.status === "expired";
        const statusText = p.status ? PATTERN_STATUS_TEXT[p.status] : "无方向";
        const lines = [
          `🕯️ 自动·${p.label}（简化算法，仅供参考）`,
          `${barTimeShort(p.time)} $${p.price}`,
          `状态：${statusText} ｜ 含金量 ${p.score ?? 0}/100`,
        ];
        if (p.confirm_price != null && p.invalidate_price != null) {
          lines.push(`确认价 $${pyRound(p.confirm_price, 3)} ｜ 失效价 $${pyRound(p.invalidate_price, 3)}`);
        }
        lines.push(p.implication);
        lines.push(p.stats ? `历史：近 ${p.stats.sample} 次确认后 ${p.stats.wins} 次走对` : "历史：样本不足");
        const style = BIAS_MARKER_STYLE[p.bias];
        const suffix = p.status ? (PATTERN_LABEL_SUFFIX[p.status] ?? "") : "";
        return {
          time: p.time,
          position: style.position,
          color: dead ? "#6e7681" : style.color,
          shape: dead || !full ? "circle" : style.shape,
          text: dead || !full ? "" : `${p.label}${suffix}`,
          tooltip: lines.join("\n"),
          group: "candle",
        } satisfies SeriesMarker;
      });
    timeframes[k] = {
      candles: tf.candles,
      volumes: tf.volumes,
      emas: tf.emas,
      vwap: tf.vwap,
      macdDif: tf.macdDif,
      macdDea: tf.macdDea,
      macdHist: tf.macdHist,
      macdCrossMarkers: crossMarkers,
      markers: capMarkersPerBar([
        ...mergeAiAutoMarkers(sig.markers, [...autoDiv.markers, ...autoBei.markers], barIndex),
        ...auto123.markers,
        ...patternMarkers,
      ]).map((m, i) => ({ ...m, id: `m-${i}` })),
      priceConnectors: [...sig.priceConnectors, ...autoDiv.priceConnectors, ...autoBei.priceConnectors, ...auto123.priceConnectors],
      macdConnectors: [...sig.macdConnectors, ...autoDiv.macdConnectors, ...autoBei.macdConnectors],
      autoDivergence: tf.autoDivergence,
      autoBeichi: tf.autoBeichi,
      pattern123: tf.pattern123,
      fvgZones: tf.fvgZones,
      offSession: offSessionSegments(tf.candles.map((c) => c.time), marketOf(symbol)),
    };
  }

  const defaultTf: TimeframeKey = anchor?.timeframe ?? "m15";
  const technicals = Object.fromEntries(TIMEFRAME_ORDER.map((k) => [k, tfs[k].summary])) as Record<
    TimeframeKey,
    IntradayTfSummary
  >;

  const lastM5 = tfs.m5.candles[tfs.m5.candles.length - 1];
  const dayContext = buildDayContext(
    input.day_kline ?? [],
    tfRaw.m5 as RawBar[],
    new Date(lastM5.time * 1000),
    tfs.m5.summary.last_vwap ?? null,
  );

  const shares = input.position?.shares;
  const cost = input.position?.cost;
  const position =
    shares && cost
      ? { shares, cost, unrealized: (last - cost) * shares, unrealizedPct: (last / cost - 1) * 100 }
      : null;

  const built: IntradayBuilt = {
    kind: "intraday",
    timeframes,
    defaultTf,
    entryPlan,
    sidebar: {
      symbol,
      name,
      asOf,
      last,
      prediction,
      entryPlan,
      position,
      technicals,
      dayContext,
      optionsLevels: input.options_levels ?? null,
      eventRisk: input.event_risk ?? null,
      news: input.news ?? [],
      context,
    },
  };

  const meta: IntradayMeta = {
    mode: prediction ? "prediction" : "preview",
    bars: Object.fromEntries(TIMEFRAME_ORDER.map((k) => [k, tfs[k].candles.length])) as Record<TimeframeKey, number>,
    technicals,
    day_context: dayContext,
    options_levels: input.options_levels ?? null,
    event_risk: input.event_risk ?? null,
  };

  return { built, meta };
}
