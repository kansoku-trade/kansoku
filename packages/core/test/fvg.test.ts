import { describe, expect, it } from "vitest";
import { detectFvgZones } from "../src/services/fvg.js";
import type { Candle } from "@kansoku/shared/types";

function series(bars: Array<[low: number, high: number]>): Candle[] {
  return bars.map(([low, high], i) => {
    const mid = (low + high) / 2;
    return { time: 1_700_000_000 + i * 300, open: mid, high, low, close: mid };
  });
}

describe("detectFvgZones", () => {
  it("detects a bullish gap when bar[i-1].high < bar[i+1].low", () => {
    const candles = series([
      [9, 10],
      [10.5, 12.5],
      [12, 13],
    ]);
    const zones = detectFvgZones(candles);
    expect(zones).toHaveLength(1);
    expect(zones[0]).toMatchObject({ kind: "bullish", low: 10, high: 12, startTime: candles[1].time });
  });

  it("detects a bearish gap when bar[i-1].low > bar[i+1].high", () => {
    const candles = series([
      [12, 13],
      [9, 11],
      [8, 10],
    ]);
    const zones = detectFvgZones(candles);
    expect(zones).toHaveLength(1);
    expect(zones[0]).toMatchObject({ kind: "bearish", low: 10, high: 12, startTime: candles[1].time });
  });

  it("returns nothing when the three bars overlap", () => {
    const candles = series([
      [10, 11],
      [10.5, 11.5],
      [10.2, 11.2],
    ]);
    expect(detectFvgZones(candles)).toHaveLength(0);
  });

  it("keeps an unfilled gap when a later bar only dips partway into it", () => {
    const candles = series([
      [9, 10],
      [10.5, 12.5],
      [12, 13],
      [11, 13.5],
    ]);
    const zones = detectFvgZones(candles);
    expect(zones).toHaveLength(1);
    expect(zones[0].kind).toBe("bullish");
  });

  it("drops a gap once a later bar fully crosses its far edge", () => {
    const candles = series([
      [9, 10],
      [10.5, 12.5],
      [12, 13],
      [9.5, 13.5],
    ]);
    expect(detectFvgZones(candles)).toHaveLength(0);
  });

  it("filters gaps smaller than the volatility threshold", () => {
    const flat = Array.from({ length: 16 }, () => [100, 110] as [number, number]);
    const candles = series([...flat, [110.05, 110.2]]);
    expect(detectFvgZones(candles)).toHaveLength(0);
  });

  it("keeps gaps that clear the volatility threshold", () => {
    const flat = Array.from({ length: 16 }, () => [100, 100.1] as [number, number]);
    const candles = series([...flat, [106, 106.1]]);
    const zones = detectFvgZones(candles);
    expect(zones).toHaveLength(1);
    expect(zones[0].kind).toBe("bullish");
  });

  it("filters gaps thinner than the percentage-of-price floor", () => {
    const candles = series([
      [998, 999],
      [1000, 1002],
      [1001, 1003],
    ]);
    expect(detectFvgZones(candles)).toHaveLength(0);
  });

  it("drops an unfilled gap that is older than the freshness window", () => {
    const rising = Array.from({ length: 42 }, (_, k) => [11 + k * 0.5, 13 + k * 0.5] as [number, number]);
    const candles = series([[9, 10], [10.5, 12.5], [12, 13], ...rising]);
    expect(detectFvgZones(candles)).toHaveLength(0);
  });

  it("skips the volatility filter when there is too little history", () => {
    const candles = series([
      [9, 10],
      [10.5, 12.5],
      [10.05, 13],
    ]);
    const zones = detectFvgZones(candles);
    expect(zones).toHaveLength(1);
    expect(zones[0]).toMatchObject({ kind: "bullish", low: 10, high: 10.05 });
  });
});
