import type { IntradayDayContext, RawBar, SessionKind } from '@kansoku/shared/types';
import { sma, toTs } from './indicators.js';
import { classifySession, easternDate } from '../marketdata/session.js';

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
  return rangeOf(todaySessionBars(bars, now, 'pre'));
}

export function regularRange(bars: RawBar[], now: Date): PriceRange | null {
  return rangeOf(todaySessionBars(bars, now, 'regular'));
}

export function openingRange(bars: RawBar[], now: Date): PriceRange | null {
  const regular = todaySessionBars(bars, now, 'regular');
  if (regular.length <= OPENING_RANGE_BARS) return null;
  return rangeOf(regular.slice(0, OPENING_RANGE_BARS));
}

function lastFinite(arr: (number | null)[]): number | null {
  for (let i = arr.length - 1; i >= 0; i--) {
    const v = arr[i];
    if (v !== null && Number.isFinite(v)) return v;
  }
  return null;
}

export function buildDayContext(
  dayBars: RawBar[],
  m5Bars: RawBar[],
  now: Date,
  vwap: number | null,
): IntradayDayContext {
  const closes = dayBars.map((b) => Number(b.close)).filter(Number.isFinite);
  const close = closes.at(-1) ?? null;
  const ma20 = closes.length >= 20 ? lastFinite(sma(closes, 20)) : null;
  const ma50 = closes.length >= 50 ? lastFinite(sma(closes, 50)) : null;
  const last20 = dayBars.slice(-20);
  const range20 = last20.length >= 20 ? rangeOf(last20) : null;
  let trend: IntradayDayContext['daily_trend'] = null;
  if (close !== null && ma20 !== null) {
    if (close > ma20 && (ma50 === null || ma20 > ma50)) trend = 'up';
    else if (close < ma20 && (ma50 === null || ma20 < ma50)) trend = 'down';
    else trend = 'range';
  }
  return {
    daily_trend: trend,
    daily_close: close,
    daily_ma20: ma20,
    daily_ma50: ma50,
    high_20d: range20?.high ?? null,
    low_20d: range20?.low ?? null,
    prev_day: prevDayLevels(dayBars, now),
    pre_market: preMarketRange(m5Bars, now),
    opening_range: openingRange(m5Bars, now),
    vwap,
  };
}

export function prevDayLevels(dayBars: RawBar[], now: Date): PrevDayLevels | null {
  const today = easternDate(now);
  const prior = dayBars.filter((bar) => easternDate(new Date(toTs(bar.time) * 1000)) < today);
  if (!prior.length) return null;
  const last = prior.at(-1)!;
  const high = Number(last.high);
  const low = Number(last.low);
  const close = Number(last.close);
  if (![high, low, close].every(Number.isFinite)) return null;
  return { high, low, close };
}
