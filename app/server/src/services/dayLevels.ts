import type { RawBar, SessionKind } from "../../../shared/types.js";
import { toTs } from "./indicators.js";
import { classifySession, easternDate } from "./session.js";

const OPENING_RANGE_BARS = 6;

export interface PriceRange {
  high: number;
  low: number;
}

export interface PrevDayLevels extends PriceRange {
  close: number;
}

export interface DayLevels {
  prev_day: PrevDayLevels | null;
  pre_market: PriceRange | null;
  opening_range: PriceRange | null;
}

function rangeOf(bars: RawBar[]): PriceRange | null {
  let high = -Infinity;
  let low = Infinity;
  for (const bar of bars) {
    const h = Number(bar.high);
    const l = Number(bar.low);
    if (Number.isFinite(h) && h > high) high = h;
    if (Number.isFinite(l) && l < low) low = l;
  }
  return Number.isFinite(high) && Number.isFinite(low) ? { high, low } : null;
}

function todaySessionBars(bars: RawBar[], now: Date, kind: SessionKind): RawBar[] {
  const today = easternDate(now);
  return bars.filter((bar) => {
    const ts = toTs(bar.time);
    return classifySession(ts) === kind && easternDate(new Date(ts * 1000)) === today;
  });
}

export function preMarketRange(bars: RawBar[], now: Date): PriceRange | null {
  return rangeOf(todaySessionBars(bars, now, "pre"));
}

export function openingRange(bars: RawBar[], now: Date): PriceRange | null {
  const regular = todaySessionBars(bars, now, "regular");
  if (regular.length <= OPENING_RANGE_BARS) return null;
  return rangeOf(regular.slice(0, OPENING_RANGE_BARS));
}

export function prevDayLevels(dayBars: RawBar[], now: Date): PrevDayLevels | null {
  const today = easternDate(now);
  const prior = dayBars.filter((bar) => easternDate(new Date(toTs(bar.time) * 1000)) < today);
  if (!prior.length) return null;
  const last = prior[prior.length - 1];
  const high = Number(last.high);
  const low = Number(last.low);
  const close = Number(last.close);
  if (![high, low, close].every(Number.isFinite)) return null;
  return { high, low, close };
}
