import type {
  CandlePattern,
  CandlePatternStats,
  CandlePatternStatus,
  IntradayFvgZone,
  SwingPoint,
} from "@kansoku/shared/types";
import { CANDLE_PATTERN_META } from "./candlePatterns.js";
import { classifySession } from "./session.js";

const AVG_RANGE_WINDOW = 14;
const AVG_VOL_WINDOW = 20;
const CONFIRM_WINDOW_BARS = 3;
const FOLLOW_THROUGH_BARS = 5;
const FOLLOW_THROUGH_RANGE_RATIO = 0.5;
const KEY_LEVEL_RANGE_RATIO = 0.5;
const MIN_STATS_SAMPLE = 8;

const BASE_STRONG = 55;
const BASE_WEAK = 30;
const BASE_NEUTRAL = 20;
const SESSION_REGULAR_BONUS = 10;
const SESSION_EXTENDED_PENALTY = -10;
const SESSION_OVERNIGHT_PENALTY = -25;
const RELVOL_HIGH = 1.5;
const RELVOL_HIGH_BONUS = 15;
const RELVOL_OK = 1.0;
const RELVOL_OK_BONUS = 5;
const RELVOL_LOW = 0.7;
const RELVOL_LOW_PENALTY = -15;
const KEY_LEVEL_BONUS = 15;

export const SCORE_FULL_MARKER = 65;
export const SCORE_DOT_MARKER = 45;

export interface PatternScoringContext {
  highs: number[];
  lows: number[];
  closes: number[];
  vols: number[];
  timesTs: number[];
  emaArrs: { period: number; arr: (number | null)[] }[];
  swingHighs: SwingPoint[];
  swingLows: SwingPoint[];
  fvgZones: IntradayFvgZone[];
}

interface TrackedPattern extends CandlePattern {
  confirmIdx: number | null;
}

function windowAvg(values: number[], endExclusive: number, window: number): number {
  const from = Math.max(0, endExclusive - window);
  let sum = 0;
  let count = 0;
  for (let j = from; j < endExclusive; j++) {
    if (!Number.isFinite(values[j])) continue;
    sum += values[j];
    count += 1;
  }
  return count ? sum / count : 0;
}

// Overnight bars are so thin that a structural signal (123 / divergence / beichi / MACD
// structure) anchored on one is usually noise — keep it only on a genuine volume impulse.
export function offSessionSignalKeeper(timesTs: number[], vols: number[]): (time: number) => boolean {
  const idxByTime = new Map<number, number>();
  for (let i = 0; i < timesTs.length; i++) idxByTime.set(timesTs[i], i);
  return (time: number) => {
    if (classifySession(time) !== "overnight") return true;
    const i = idxByTime.get(time);
    if (i === undefined) return true;
    const avgVol = windowAvg(vols, i, AVG_VOL_WINDOW);
    return avgVol > 0 && vols[i] >= RELVOL_HIGH * avgVol;
  };
}

export function enrichCandlePatterns(patterns: CandlePattern[], ctx: PatternScoringContext): CandlePattern[] {
  const { highs, lows, closes, vols, timesTs, emaArrs, swingHighs, swingLows, fvgZones } = ctx;
  const n = timesTs.length;
  const idxByTime = new Map<number, number>();
  for (let i = 0; i < n; i++) idxByTime.set(timesTs[i], i);
  const ranges = highs.map((h, i) => h - lows[i]);

  const tracked: TrackedPattern[] = [];
  for (const p of patterns) {
    const i = idxByTime.get(p.time);
    if (i === undefined) continue;
    const span = p.span ?? 1;
    const start = i - span + 1;
    const meta = CANDLE_PATTERN_META[p.kind];
    const directional = p.bias !== "neutral";

    const session = classifySession(p.time);
    if (session === "overnight" && !meta.strong) continue;

    let score = BASE_NEUTRAL;
    if (meta.strong) score = BASE_STRONG;
    else if (directional) score = BASE_WEAK;
    if (session === "regular") score += SESSION_REGULAR_BONUS;
    else if (session === "overnight") score += SESSION_OVERNIGHT_PENALTY;
    else score += SESSION_EXTENDED_PENALTY;

    const avgVol = windowAvg(vols, start, AVG_VOL_WINDOW);
    if (avgVol > 0) {
      let maxVol = 0;
      for (let j = Math.max(0, start); j <= i; j++) maxVol = Math.max(maxVol, vols[j] ?? 0);
      const relVol = maxVol / avgVol;
      if (relVol >= RELVOL_HIGH) score += RELVOL_HIGH_BONUS;
      else if (relVol >= RELVOL_OK) score += RELVOL_OK_BONUS;
      else if (relVol < RELVOL_LOW) score += RELVOL_LOW_PENALTY;
    }

    const avgRange = windowAvg(ranges, start, AVG_RANGE_WINDOW);
    if (directional && avgRange > 0 && p.invalidate_price != null) {
      const point = p.invalidate_price;
      const startTs = timesTs[Math.max(0, start)];
      const levels: number[] = [];
      const swings = p.bias === "bullish" ? swingLows : swingHighs;
      for (const s of swings) if (s.time < startTs) levels.push(s.price);
      for (const { arr } of emaArrs) {
        const v = arr[i];
        if (v !== null && Number.isFinite(v)) levels.push(v);
      }
      for (const z of fvgZones) {
        if (z.startTime <= p.time) levels.push(z.low, z.high);
      }
      const tolerance = KEY_LEVEL_RANGE_RATIO * avgRange;
      if (levels.some((lv) => Math.abs(point - lv) <= tolerance)) score += KEY_LEVEL_BONUS;
    }

    let status: CandlePatternStatus | null = null;
    let confirmIdx: number | null = null;
    if (directional && p.confirm_price != null && p.invalidate_price != null) {
      status = "pending";
      const last = Math.min(n - 1, i + CONFIRM_WINDOW_BARS);
      for (let j = i + 1; j <= last; j++) {
        const c = closes[j];
        const confirmed = p.bias === "bullish" ? c > p.confirm_price : c < p.confirm_price;
        const invalidated = p.bias === "bullish" ? c < p.invalidate_price : c > p.invalidate_price;
        if (confirmed) {
          status = "confirmed";
          confirmIdx = j;
          break;
        }
        if (invalidated) {
          status = "invalidated";
          break;
        }
      }
      if (status === "pending" && n - 1 - i >= CONFIRM_WINDOW_BARS) status = "expired";
    }

    tracked.push({
      ...p,
      score: Math.round(Math.min(100, Math.max(0, score))),
      status,
      stats: null,
      confirmIdx,
    });
  }

  const statsByKind = new Map<CandlePattern["kind"], CandlePatternStats>();
  for (const p of tracked) {
    if (p.confirmIdx === null) continue;
    const c = p.confirmIdx;
    const avgRange = windowAvg(ranges, c, AVG_RANGE_WINDOW);
    if (avgRange <= 0) continue;
    const threshold = FOLLOW_THROUGH_RANGE_RATIO * avgRange;
    let win = false;
    for (let k = c + 1; k <= Math.min(n - 1, c + FOLLOW_THROUGH_BARS); k++) {
      const move = p.bias === "bullish" ? closes[k] - closes[c] : closes[c] - closes[k];
      if (move >= threshold) {
        win = true;
        break;
      }
    }
    if (!win && c + FOLLOW_THROUGH_BARS > n - 1) continue;
    const entry = statsByKind.get(p.kind) ?? { sample: 0, wins: 0 };
    entry.sample += 1;
    if (win) entry.wins += 1;
    statsByKind.set(p.kind, entry);
  }

  return tracked.map(({ confirmIdx: _confirmIdx, ...p }) => {
    const stats = statsByKind.get(p.kind);
    return { ...p, stats: stats && stats.sample >= MIN_STATS_SAMPLE ? { ...stats } : null };
  });
}
