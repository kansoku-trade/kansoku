import { describe, expect, it } from "vitest";
import { mergeCandleBar, mergeFreshBars } from "../src/realtime/candleMerge.js";

const rawBar = (ts: number, close: number) => ({
  time: new Date(ts).toISOString(),
  open: close,
  high: close,
  low: close,
  close,
  volume: 1,
});

describe("mergeCandleBar", () => {
  it("appends to an empty series", () => {
    const bars = mergeCandleBar([], { ts: 1000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 });
    expect(bars).toHaveLength(1);
    expect(bars[0]).toEqual({ time: new Date(1000).toISOString(), open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 });
  });

  it("updates the last bar when the push shares the same bucket timestamp", () => {
    const seed = [{ time: new Date(1000).toISOString(), open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 }];
    const bars = mergeCandleBar(seed, { ts: 1000, open: 1, high: 3, low: 0.5, close: 2, volume: 150 });
    expect(bars).toHaveLength(1);
    expect(bars[0].close).toBe(2);
    expect(bars[0].high).toBe(3);
    expect(bars[0].volume).toBe(150);
  });

  it("appends a new bar when the push opens a later bucket", () => {
    const seed = [{ time: new Date(1000).toISOString(), open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 }];
    const bars = mergeCandleBar(seed, { ts: 2000, open: 2, high: 2.5, low: 1.8, close: 2.2, volume: 50 });
    expect(bars).toHaveLength(2);
    expect(bars[1].time).toBe(new Date(2000).toISOString());
  });

  it("ignores a stale out-of-order push", () => {
    const seed = [
      { time: new Date(1000).toISOString(), open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 },
      { time: new Date(2000).toISOString(), open: 2, high: 2.5, low: 1.8, close: 2.2, volume: 50 },
    ];
    const bars = mergeCandleBar(seed, { ts: 1000, open: 9, high: 9, low: 9, close: 9, volume: 9 });
    expect(bars).toBe(seed);
  });
});

describe("mergeFreshBars", () => {
  it("keeps historical values pinned while refreshing the frozen tail and appending newer bars", () => {
    const merged = mergeFreshBars(
      [rawBar(1_000, 1), rawBar(2_000, 2)],
      [rawBar(1_000, 10), rawBar(2_000, 20), rawBar(3_000, 3)],
    );

    expect(merged).toEqual([rawBar(1_000, 1), rawBar(2_000, 20), rawBar(3_000, 3)]);
  });

  it("uses the original snapshot range to insert bars behind an already-appended live tail", () => {
    const merged = mergeFreshBars(
      [rawBar(1_000, 1), rawBar(2_000, 2), rawBar(4_000, 4)],
      [rawBar(1_000, 10), rawBar(2_000, 20), rawBar(3_000, 3), rawBar(4_000, 40)],
      { start: 1_000, end: 2_000 },
    );

    expect(merged).toEqual([
      rawBar(1_000, 1),
      rawBar(2_000, 20),
      rawBar(3_000, 3),
      rawBar(4_000, 40),
    ]);
  });
});
