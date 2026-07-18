import { describe, expect, it } from "vitest";
import type { RawBar } from "@kansoku/shared/types";
import { openingRange, preMarketRange, prevDayLevels } from "../src/services/dayLevels.js";

const NOW = new Date("2026-07-02T15:00:00Z");

function bar(time: string, high: number, low: number, close = (high + low) / 2): RawBar {
  return { time, open: close, high, low, close, volume: 1000 };
}

describe("prevDayLevels", () => {
  it("picks the most recent day strictly before today", () => {
    const bars = [
      bar("2026-06-30T04:00:00Z", 110, 100, 105),
      bar("2026-07-01T04:00:00Z", 120, 108, 118),
      bar("2026-07-02T04:00:00Z", 130, 117, 125),
    ];
    expect(prevDayLevels(bars, NOW)).toEqual({ high: 120, low: 108, close: 118 });
  });

  it("returns null when only today's bar exists", () => {
    expect(prevDayLevels([bar("2026-07-02T04:00:00Z", 130, 117)], NOW)).toBeNull();
  });

  it("returns null on empty input", () => {
    expect(prevDayLevels([], NOW)).toBeNull();
  });
});

describe("preMarketRange", () => {
  it("covers only today's pre-market bars", () => {
    const bars = [
      bar("2026-07-01T12:00:00Z", 99, 97),
      bar("2026-07-02T12:00:00Z", 103, 101),
      bar("2026-07-02T12:30:00Z", 105, 102),
      bar("2026-07-02T13:30:00Z", 120, 90),
    ];
    expect(preMarketRange(bars, NOW)).toEqual({ high: 105, low: 101 });
  });

  it("returns null when today has no pre-market bars", () => {
    expect(preMarketRange([bar("2026-07-02T13:30:00Z", 120, 90)], NOW)).toBeNull();
  });
});

describe("openingRange", () => {
  function regularBars(count: number): RawBar[] {
    const start = Date.parse("2026-07-02T13:30:00Z");
    return Array.from({ length: count }, (_, i) =>
      bar(new Date(start + i * 5 * 60_000).toISOString(), 100 + i, 99 + i),
    );
  }

  it("uses the first six regular bars once the range window has closed", () => {
    const out = openingRange(regularBars(8), NOW);
    expect(out).toEqual({ high: 105, low: 99 });
  });

  it("returns null while still inside the first 30 minutes", () => {
    expect(openingRange(regularBars(6), NOW)).toBeNull();
  });

  it("ignores pre-market bars when counting the window", () => {
    const bars = [bar("2026-07-02T12:00:00Z", 200, 10), ...regularBars(8)];
    expect(openingRange(bars, NOW)).toEqual({ high: 105, low: 99 });
  });
});
