import type { RawBar } from "../../../../shared/types.js";

export interface PushBar {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
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

// Poller safety-net merge: fold a freshly-refetched full series into the frozen
// analysis snapshot WITHOUT rewriting history. Bars older than the frozen tail
// keep their analysis-time values (the snapshot stays pinned); only the tail bar
// and genuinely newer bars are updated/appended — so a stalled push self-heals
// on new data without the full-refetch clobbering the original candles. Also
// reused by the historical-chart "load subsequent bars" forward view.
export function mergeFreshBars(frozen: RawBar[], fresh: RawBar[]): RawBar[] {
  if (frozen.length === 0) return fresh;
  const frozenTail = Date.parse(frozen[frozen.length - 1].time);
  let out = frozen;
  for (const bar of fresh) {
    const ts = Date.parse(bar.time);
    if (ts < frozenTail) continue;
    const lastTs = Date.parse(out[out.length - 1].time);
    if (ts === lastTs) out = [...out.slice(0, -1), bar];
    else if (ts > lastTs) out = [...out, bar];
  }
  return out;
}
