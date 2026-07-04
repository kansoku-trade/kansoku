import {
  AUTO_SIGNAL_META,
  type CandlePattern,
  type ColoredPoint,
  type Connector,
  type DivergencePair,
  type DivergencePoint,
  type EmaLine,
  type IntradayBuilt,
  type IntradayContext,
  type IntradayEntryPlan,
  type IntradayPriceZone,
  type IntradayPrediction,
  type IntradayTargetContext,
  type IntradayTfData,
  type IntradayTfSummary,
  type MacdCross,
  type NewsItem,
  type Pattern123,
  type RawBar,
  type SeriesMarker,
  type SwingPoint,
  type TimeframeKey,
} from "../../../shared/types.js";
import { formatMarketMonthDayTime } from "../../../shared/time.js";
import { ClientError } from "../errors.js";
import { CANDLE_PATTERN_META, detectCandlePatterns } from "./candlePatterns.js";
import { ema, findSwings, lineData, macd, pyRound, sma, toTs } from "./indicators.js";
import { classifyMacdStructure, MACD_STRUCTURE_META, ZERO_TANGLE_NOTE, type MacdStructure } from "./macdStructure.js";
import { detect123Patterns } from "./pattern123.js";
import { offSessionBars } from "./session.js";

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

export interface CoercedTimeframe {
  candles: IntradayTfData["candles"];
  volumes: ColoredPoint[];
  emas: EmaLine[];
  macdDif: IntradayTfData["macdDif"];
  macdDea: IntradayTfData["macdDea"];
  macdHist: ColoredPoint[];
  macdCrosses: MacdCross[];
  structure: MacdStructure;
  candlePatterns: CandlePattern[];
  autoDivergence: DivergencePair[];
  autoBeichi: DivergencePair[];
  pattern123: Pattern123[];
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
      `Pull more history: \`longbridge kline <SYM> --period ${key} --count 150 --format json\`.`,
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

  const macdCrosses = findMacdCrosses(hist, timesTs);
  const structure = classifyMacdStructure(dif, hist, timesTs);
  const candlePatterns = detectCandlePatterns(opens, highs, lows, closes, timesTs);

  const histByTime = new Map<number, number>();
  for (let i = 0; i < hist.length; i++) {
    const h = hist[i];
    if (h !== null) histByTime.set(timesTs[i], h);
  }
  const withMacd = (pts: { time: number; price: number }[]): DivergencePoint[] =>
    pts.filter((p) => histByTime.has(p.time)).map((p) => ({ ...p, macd_value: histByTime.get(p.time) as number }));

  const autoDivergence = [
    ...findPriceDivergence(withMacd(swingHighs), true),
    ...findPriceDivergence(withMacd(swingLows), false),
  ].sort((a, b) => a.b.time - b.b.time);
  const autoBeichi = findMacdBeichi(hist, highs, lows, timesTs).sort((a, b) => a.b.time - b.b.time);
  const pattern123 = detect123Patterns(highs, lows, closes, timesTs).slice(-2);

  return {
    candles,
    volumes,
    emas: emaArrs.map(({ period, arr }) => ({ period, data: lineData(timesTs, arr) })),
    macdDif: lineData(timesTs, dif),
    macdDea: lineData(timesTs, dea),
    macdHist: histBars,
    macdCrosses,
    structure,
    candlePatterns,
    autoDivergence: autoDivergence.slice(-2),
    autoBeichi: autoBeichi.slice(-2),
    pattern123,
    lastClose: closes[closes.length - 1],
    summary: {
      last_dif: lastNonNull(dif),
      last_dea: lastNonNull(dea),
      last_hist: lastNonNull(hist),
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
    const color = bias === "bullish" ? "#26a69a" : bias === "bearish" ? "#ef5350" : "#ffc107";
    const shape = bias === "bullish" ? "arrowUp" : bias === "bearish" ? "arrowDown" : "circle";

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
      markers.push({ time: p.time, position, color, shape: "circle", text: meta.icon, tooltip, group });
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
  ema_periods?: number[];
  news?: NewsItem[];
  position?: { shares?: number; cost?: number };
  prediction?: IntradayPrediction | null;
  context?: IntradayContext | null;
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
      "Pull each with `longbridge kline <SYM> --period <5m|15m|1h> --count 150 --format json`.",
    );
  }

  const context = input.context ?? null;
  if (context) validateIntradayContext(context);

  const prediction = input.prediction
    ? {
        ...input.prediction,
        range_bound_plan: input.prediction.range_bound_plan ?? input.prediction.range_plan,
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
    signalsByTf[anchor.timeframe].markers.push({
      time: toTs(anchor.time),
      position: "inBar",
      color: "#58a6ff",
      shape: "circle",
      text: "🎯",
      tooltip: `🎯 AI 预测锚点\n${TIMEFRAME_LABELS[anchor.timeframe]} · ${barTimeShort(toTs(anchor.time))} · $${Number(anchor.price).toFixed(2)}\n方向判断（${direction === "short" ? "做空" : direction === "long" ? "做多" : "观望"}）基于这根 K 线做出`,
      group: "ai",
    });
  }

  const epRaw = prediction?.entry_plan;
  const entryPlan = epRaw?.entry && epRaw.stop ? computeIntradayEntryPlan(epRaw, direction, prediction?.price_zones) : null;

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
    const patternMarkers: SeriesMarker[] = dedupedPatterns.slice(-12).map((p) => ({
      time: p.time,
      position: p.bias === "bullish" ? "belowBar" : "aboveBar",
      color: p.bias === "bullish" ? "#26a69a" : "#ef5350",
      shape: p.bias === "bullish" ? "arrowUp" : "arrowDown",
      text: CANDLE_PATTERN_META[p.kind].strong ? p.label : "",
      tooltip: `🕯️ 自动·${p.label}（简化算法，仅供参考）\n${barTimeShort(p.time)} $${p.price}\n${p.implication}`,
      group: "candle",
    }));
    timeframes[k] = {
      candles: tf.candles,
      volumes: tf.volumes,
      emas: tf.emas,
      macdDif: tf.macdDif,
      macdDea: tf.macdDea,
      macdHist: tf.macdHist,
      macdCrossMarkers: crossMarkers,
      markers: [...sig.markers, ...autoDiv.markers, ...autoBei.markers, ...auto123.markers, ...patternMarkers]
        .sort((a, b) => a.time - b.time)
        .map((m, i) => ({ ...m, id: `m-${i}` })),
      priceConnectors: [...sig.priceConnectors, ...autoDiv.priceConnectors, ...autoBei.priceConnectors, ...auto123.priceConnectors],
      macdConnectors: [...sig.macdConnectors, ...autoDiv.macdConnectors, ...autoBei.macdConnectors],
      autoDivergence: tf.autoDivergence,
      autoBeichi: tf.autoBeichi,
      pattern123: tf.pattern123,
      offSession: offSessionBars(tf.candles.map((c) => c.time)),
    };
  }

  const defaultTf: TimeframeKey = anchor?.timeframe ?? "m15";
  const technicals = Object.fromEntries(TIMEFRAME_ORDER.map((k) => [k, tfs[k].summary])) as Record<
    TimeframeKey,
    IntradayTfSummary
  >;

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
      news: input.news ?? [],
      context,
    },
  };

  const meta: IntradayMeta = {
    mode: prediction ? "prediction" : "preview",
    bars: Object.fromEntries(TIMEFRAME_ORDER.map((k) => [k, tfs[k].candles.length])) as Record<TimeframeKey, number>,
    technicals,
  };

  return { built, meta };
}
