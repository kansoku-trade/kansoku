import { describe, expect, it } from "vitest";
import type { RawBar } from "@kansoku/shared/types";
import { lastVwap, sessionVwap } from "../src/services/vwap.js";

function bar(time: string, h: number, l: number, c: number, v: number): RawBar {
  return { time, open: c, high: h, low: l, close: c, volume: v };
}

describe("sessionVwap", () => {
  it("accumulates typical price × volume within a day", () => {
    const bars = [
      bar("2026-07-06T13:30:00Z", 12, 9, 9, 100),
      bar("2026-07-06T13:35:00Z", 21, 18, 21, 300),
    ];
    const out = sessionVwap(bars);
    expect(out).toHaveLength(2);
    expect(out[0].value).toBeCloseTo(10, 8);
    expect(out[1].value).toBeCloseTo((10 * 100 + 20 * 300) / 400, 8);
    expect(lastVwap(out)).toBeCloseTo(17.5, 8);
  });

  it("resets at the Eastern day boundary", () => {
    const bars = [
      bar("2026-07-06T13:30:00Z", 12, 9, 9, 100),
      bar("2026-07-07T13:30:00Z", 33, 27, 30, 200),
    ];
    const out = sessionVwap(bars);
    expect(out[1].value).toBeCloseTo(30, 8);
  });

  it("carries the running value across a zero-volume bar", () => {
    const bars = [
      bar("2026-07-06T13:30:00Z", 12, 9, 9, 100),
      bar("2026-07-06T13:35:00Z", 50, 40, 45, 0),
    ];
    const out = sessionVwap(bars);
    expect(out).toHaveLength(2);
    expect(out[1].value).toBeCloseTo(10, 8);
  });
});
