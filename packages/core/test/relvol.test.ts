import { describe, expect, it } from "vitest";
import type { RawBar } from "@kansoku/shared/types";
import { computeRelativeVolume } from "../src/services/relvol.js";

const NOW = new Date("2026-07-02T15:00:00Z");

function bar(time: string, volume: number): RawBar {
  return { time, open: 100, high: 101, low: 99, close: 100, volume };
}

describe("computeRelativeVolume", () => {
  it("compares today's cumulative volume with the prior-day same-time window", () => {
    const bars = [
      bar("2026-07-01T13:30:00Z", 100),
      bar("2026-07-01T13:45:00Z", 100),
      bar("2026-07-01T14:00:00Z", 100),
      bar("2026-07-01T14:15:00Z", 100),
      bar("2026-07-02T13:30:00Z", 200),
      bar("2026-07-02T13:45:00Z", 200),
      bar("2026-07-02T14:00:00Z", 200),
    ];
    const out = computeRelativeVolume(bars, NOW);
    expect(out).not.toBeNull();
    expect(out!.today_cum).toBe(600);
    expect(out!.baseline_avg).toBe(300);
    expect(out!.ratio).toBe(2);
    expect(out!.days_used).toBe(1);
  });

  it("averages over multiple prior days", () => {
    const bars = [
      bar("2026-06-30T13:30:00Z", 100),
      bar("2026-07-01T13:30:00Z", 300),
      bar("2026-07-02T13:30:00Z", 400),
    ];
    const out = computeRelativeVolume(bars, NOW);
    expect(out!.baseline_avg).toBe(200);
    expect(out!.ratio).toBe(2);
    expect(out!.days_used).toBe(2);
  });

  it("ignores pre-market and post-market bars", () => {
    const bars = [
      bar("2026-07-01T13:30:00Z", 100),
      bar("2026-07-01T21:00:00Z", 9999),
      bar("2026-07-02T12:00:00Z", 9999),
      bar("2026-07-02T13:30:00Z", 100),
    ];
    const out = computeRelativeVolume(bars, NOW);
    expect(out!.today_cum).toBe(100);
    expect(out!.baseline_avg).toBe(100);
  });

  it("returns null when today has no regular bars", () => {
    const bars = [bar("2026-07-01T13:30:00Z", 100)];
    expect(computeRelativeVolume(bars, NOW)).toBeNull();
  });

  it("returns null when there is no prior-day baseline", () => {
    const bars = [bar("2026-07-02T13:30:00Z", 100)];
    expect(computeRelativeVolume(bars, NOW)).toBeNull();
  });

  it("returns null when the baseline volume is zero", () => {
    const bars = [bar("2026-07-01T13:30:00Z", 0), bar("2026-07-02T13:30:00Z", 100)];
    expect(computeRelativeVolume(bars, NOW)).toBeNull();
  });
});
