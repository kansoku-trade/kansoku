import type { RawBar } from "@kansoku/shared/types";

export interface PushBar {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface FrozenBarRange {
  start: number;
  end: number;
}

export function mergeCandleBar(bars: RawBar[], bar: PushBar): RawBar[] {
  const rawBar: RawBar = {
    time: new Date(bar.ts).toISOString(),
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
  };
  if (bars.length === 0) return [rawBar];
  const lastTs = Date.parse(bars[bars.length - 1].time);
  if (bar.ts === lastTs) return [...bars.slice(0, -1), rawBar];
  if (bar.ts > lastTs) return [...bars, rawBar];
  return bars;
}

// Fold a freshly-refetched series into the current view without rewriting the
// analysis snapshot. A caller may pass the original snapshot range so it stays
// stable after live pushes extend the current tail: older requested history is
// prepended, snapshot-time values before the tail stay pinned, and every missing
// bar at/after the snapshot tail can still be inserted. Without an explicit
// range this retains the historical forward-view behavior of only refreshing
// the current tail and appending newer bars.
export function mergeFreshBars(current: RawBar[], fresh: RawBar[], frozenRange?: FrozenBarRange): RawBar[] {
  if (current.length === 0) return fresh;
  const currentTail = Date.parse(current[current.length - 1].time);
  const frozen = frozenRange ?? { start: Number.NEGATIVE_INFINITY, end: currentTail };
  const byTime = new Map<number, RawBar>();
  for (const bar of current) {
    const ts = Date.parse(bar.time);
    if (Number.isFinite(ts)) byTime.set(ts, bar);
  }
  for (const bar of fresh) {
    const ts = Date.parse(bar.time);
    if (!Number.isFinite(ts)) continue;
    if (ts >= frozen.start && ts < frozen.end) continue;
    byTime.set(ts, bar);
  }
  return [...byTime.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, bar]) => bar);
}
