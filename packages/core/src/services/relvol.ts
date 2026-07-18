import type { RawBar, RelativeVolume } from "@kansoku/shared/types";
import { toTs } from "./indicators.js";
import { classifySession, easternDate, easternMinuteOfDay } from "./session.js";

const BASELINE_DAYS = 5;

export function computeRelativeVolume(bars: RawBar[], now: Date = new Date()): RelativeVolume | null {
  const today = easternDate(now);
  const byDay = new Map<string, { minute: number; volume: number }[]>();
  for (const bar of bars) {
    const ts = toTs(bar.time);
    if (classifySession(ts) !== "regular") continue;
    const volume = Number(bar.volume);
    if (!Number.isFinite(volume)) continue;
    const date = easternDate(new Date(ts * 1000));
    const entry = { minute: easternMinuteOfDay(ts), volume };
    const list = byDay.get(date);
    if (list) list.push(entry);
    else byDay.set(date, [entry]);
  }

  const todayEntries = byDay.get(today);
  if (!todayEntries?.length) return null;
  const cutoff = Math.max(...todayEntries.map((e) => e.minute));
  const todayCum = todayEntries.reduce((sum, e) => sum + e.volume, 0);

  const priorDates = [...byDay.keys()]
    .filter((d) => d < today)
    .sort()
    .slice(-BASELINE_DAYS);
  if (!priorDates.length) return null;

  const sums = priorDates.map((d) =>
    byDay
      .get(d)!
      .filter((e) => e.minute <= cutoff)
      .reduce((sum, e) => sum + e.volume, 0),
  );
  const avg = sums.reduce((sum, v) => sum + v, 0) / sums.length;
  if (avg <= 0) return null;

  return {
    ratio: todayCum / avg,
    today_cum: todayCum,
    baseline_avg: avg,
    days_used: sums.length,
    cutoff_minute: cutoff,
  };
}
