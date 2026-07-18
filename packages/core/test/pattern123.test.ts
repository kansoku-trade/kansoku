import { describe, expect, it } from "vitest";
import type { RawBar } from "../../shared/types.js";
import { coerceIntradayTimeframe } from "../src/services/intraday.js";
import { detect123Patterns } from "../src/services/pattern123.js";

function bars(closes: number[]): { highs: number[]; lows: number[]; closes: number[]; timesTs: number[] } {
  return {
    highs: closes.map((c) => c + 0.5),
    lows: closes.map((c) => c - 0.5),
    closes,
    timesTs: closes.map((_, i) => 1_700_000_000 + i * 300),
  };
}

const ramp = (from: number, to: number, step: number) => {
  const out: number[] = [];
  for (let v = from; step > 0 ? v <= to : v >= to; v += step) out.push(v);
  return out;
};
const flat = (n: number, price: number) => Array.from({ length: n }, () => price);

const BULL_HEAD = [...ramp(118, 110, -1), 108, 106, 104, 102, 100, 102, 104, 106, 104, 103, 102];

describe("detect123Patterns", () => {
  it("detects a confirmed bullish 123", () => {
    const closes = [...BULL_HEAD, 104, 107, ...flat(4, 107)];
    const { highs, lows, closes: c, timesTs } = bars(closes);
    const found = detect123Patterns(highs, lows, c, timesTs);
    expect(found).toHaveLength(1);
    const pat = found[0];
    expect(pat.kind).toBe("bullish");
    expect(pat.status).toBe("confirmed");
    expect(pat.p1.price).toBe(99.5);
    expect(pat.p2.price).toBe(106.5);
    expect(pat.p3.price).toBe(101.5);
    expect(pat.trigger).toBe(106.5);
    expect(pat.invalidation).toBe(99.5);
    expect(pat.confirm?.price).toBe(107);
  });

  it("marks an unbroken structure as forming", () => {
    const closes = [...BULL_HEAD, 103, 104, 105, 105, ...flat(4, 104)];
    const { highs, lows, closes: c, timesTs } = bars(closes);
    const found = detect123Patterns(highs, lows, c, timesTs);
    expect(found).toHaveLength(1);
    expect(found[0].status).toBe("forming");
    expect(found[0].confirm).toBeNull();
  });

  it("drops the pattern when point 1 breaks before confirmation", () => {
    const closes = [...BULL_HEAD, 101, 99, 98, ...flat(4, 98)];
    const { highs, lows, closes: c, timesTs } = bars(closes);
    expect(detect123Patterns(highs, lows, c, timesTs)).toHaveLength(0);
  });

  it("detects a confirmed bearish 123", () => {
    const closes = [...ramp(82, 90, 1), 92, 94, 96, 98, 100, 98, 96, 94, 96, 97, 98, 96, 93, ...flat(4, 93)];
    const { highs, lows, closes: c, timesTs } = bars(closes);
    const found = detect123Patterns(highs, lows, c, timesTs);
    expect(found).toHaveLength(1);
    const pat = found[0];
    expect(pat.kind).toBe("bearish");
    expect(pat.status).toBe("confirmed");
    expect(pat.p1.price).toBe(100.5);
    expect(pat.p2.price).toBe(93.5);
    expect(pat.p3.price).toBe(98.5);
    expect(pat.trigger).toBe(93.5);
    expect(pat.invalidation).toBe(100.5);
    expect(pat.confirm?.price).toBe(93);
  });

  it("stays quiet in shallow chop", () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 + (i % 2) * 0.5);
    const { highs, lows, closes: c, timesTs } = bars(closes);
    expect(detect123Patterns(highs, lows, c, timesTs)).toHaveLength(0);
  });

  it("flows through coerceIntradayTimeframe into summary and tf data", () => {
    const closes = [...ramp(170, 100, -1), 102, 104, 106, 104, 103, 102, 104, 107, ...flat(4, 107)];
    // base picked so the tail of the series (where the 123 confirms) lands in the
    // regular ET session — overnight-confirmed signals are now filtered out
    const base = Date.parse("2026-06-01T08:00:00.000Z") / 1000;
    const raw: RawBar[] = closes.map((c, i) => ({
      time: new Date((base + i * 300) * 1000).toISOString(),
      open: c,
      high: c + 0.5,
      low: c - 0.5,
      close: c,
      volume: 1000,
    }));
    const tf = coerceIntradayTimeframe(raw, "m5");
    expect(tf.pattern123).toHaveLength(1);
    expect(tf.pattern123[0].kind).toBe("bullish");
    expect(tf.pattern123[0].status).toBe("confirmed");
    expect(tf.summary.pattern_123).toEqual(tf.pattern123);
  });
});
