import { describe, expect, it } from "vitest";
import type { RawBar } from "@kansoku/shared/types";
import { buildDayContext } from "../src/services/dayLevels.js";

function dayBar(date: string, close: number): RawBar {
  return { time: `${date}T20:00:00Z`, open: close, high: close + 1, low: close - 1, close, volume: 1000 };
}

function daysBack(n: number, lastDate: string): string[] {
  const out: string[] = [];
  const end = new Date(`${lastDate}T00:00:00Z`);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end.getTime() - i * 86400_000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

describe("buildDayContext", () => {
  const now = new Date("2026-07-06T14:00:00Z");

  it("classifies a rising close>ma20>ma50 series as up", () => {
    const dates = daysBack(60, "2026-07-06");
    const bars = dates.map((d, i) => dayBar(d, 100 + i));
    const ctx = buildDayContext(bars, [], now, 123.4);
    expect(ctx.daily_trend).toBe("up");
    expect(ctx.daily_close).toBe(159);
    expect(ctx.daily_ma20).toBeCloseTo((140 + 159) / 2, 8);
    expect(ctx.high_20d).toBe(160);
    expect(ctx.low_20d).toBe(139);
    expect(ctx.prev_day).toEqual({ high: 159, low: 157, close: 158 });
    expect(ctx.vwap).toBe(123.4);
  });

  it("classifies a falling series as down", () => {
    const dates = daysBack(60, "2026-07-06");
    const bars = dates.map((d, i) => dayBar(d, 200 - i));
    const ctx = buildDayContext(bars, [], now, null);
    expect(ctx.daily_trend).toBe("down");
  });

  it("returns nulls on empty inputs", () => {
    const ctx = buildDayContext([], [], now, null);
    expect(ctx.daily_trend).toBeNull();
    expect(ctx.daily_close).toBeNull();
    expect(ctx.prev_day).toBeNull();
    expect(ctx.pre_market).toBeNull();
    expect(ctx.opening_range).toBeNull();
  });
});
