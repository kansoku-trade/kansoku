import { describe, expect, it } from "vitest";
import type { RawBar } from "@kansoku/shared/types";
import { buildIntraday, type IntradayInput } from "../src/services/intraday.js";

const DAY = { y: 2026, m: 6, d: 8 };

function utcTs(hour: number, minute: number): number {
  return Date.UTC(DAY.y, DAY.m, DAY.d, hour, minute, 0) / 1000;
}

function makeBar(t: number, price: number): RawBar {
  return {
    time: new Date(t * 1000).toISOString(),
    open: price,
    high: price + 0.6,
    low: price - 0.6,
    close: price + 0.1,
    volume: 1000,
  };
}

function hkDayBars(stepMin: number): RawBar[] {
  const start = utcTs(1, 30);
  const end = utcTs(7, 55);
  const out: RawBar[] = [];
  let price = 500;
  for (let t = start; t <= end; t += stepMin * 60) {
    price += Math.sin(t / 3600) * 0.4;
    out.push(makeBar(t, price));
  }
  return out;
}

function paddedSeries(stepMin: number, count: number): RawBar[] {
  const end = utcTs(8, 0);
  const out: RawBar[] = [];
  let price = 500;
  for (let i = count - 1; i >= 0; i--) {
    price += Math.sin(i) * 0.4;
    out.push(makeBar(end - i * stepMin * 60, price));
  }
  return out;
}

describe("buildIntraday off-session mask is market-aware for HK symbols", () => {
  it("masks only the HK lunch gap, never the two regular trading blocks", () => {
    const input: IntradayInput = {
      symbol: "700.HK",
      timeframes: {
        m5: hkDayBars(5),
        m15: paddedSeries(15, 70),
        h1: paddedSeries(60, 70),
      },
    };

    const { built } = buildIntraday(input);
    const segments = built.timeframes.m5.offSession ?? [];

    const lunchStart = utcTs(4, 0);
    const lunchEnd = utcTs(5, 0);

    expect(segments.length).toBeGreaterThan(0);
    for (const seg of segments) {
      expect(seg.startTime).toBeGreaterThanOrEqual(lunchStart);
      expect(seg.endTime).toBeLessThan(lunchEnd);
    }
  });
});
