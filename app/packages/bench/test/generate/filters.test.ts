import { describe, expect, it } from "vitest";
import { checkAnomalies } from "../../src/generate/filters.js";

function bar(time: string, close: number, volume = 1_000_000) {
  return { time, open: `${close}`, high: `${close}`, low: `${close}`, close: `${close}`, volume: `${volume}` };
}

function cleanSeries(length: number): ReturnType<typeof bar>[] {
  const out = [];
  for (let i = 0; i < length; i++) out.push(bar(`2026-01-${String((i % 27) + 1).padStart(2, "0")}`, 100 + (i % 5)));
  return out;
}

describe("checkAnomalies", () => {
  it("passes cleanly on a clean series with sufficient bars either side", () => {
    const bars = cleanSeries(300);
    const reasons = checkAnomalies({ bars, cutoffIndex: 260, requiredBefore: 250, requiredAfter: 20 });
    expect(reasons).toEqual([]);
  });

  it("flags insufficient_before when too few bars precede cutoff", () => {
    const bars = cleanSeries(300);
    const reasons = checkAnomalies({ bars, cutoffIndex: 100, requiredBefore: 250, requiredAfter: 20 });
    expect(reasons).toContain("insufficient_before");
  });

  it("flags insufficient_after when too few bars follow cutoff", () => {
    const bars = cleanSeries(300);
    const reasons = checkAnomalies({ bars, cutoffIndex: 295, requiredBefore: 250, requiredAfter: 20 });
    expect(reasons).toContain("insufficient_after");
  });

  it("flags close_to_close_gap when a >20% move sits in the anomaly window", () => {
    const bars = cleanSeries(300);
    bars[262] = bar(bars[262].time, Number(bars[261].close) * 1.5);
    const reasons = checkAnomalies({ bars, cutoffIndex: 260, requiredBefore: 250, requiredAfter: 20 });
    expect(reasons).toContain("close_to_close_gap");
  });

  it("does not flag a gap that sits outside the anomaly window", () => {
    const bars = cleanSeries(300);
    bars[290] = bar(bars[290].time, Number(bars[289].close) * 1.5);
    const reasons = checkAnomalies({ bars, cutoffIndex: 260, requiredBefore: 250, requiredAfter: 20 });
    expect(reasons).toEqual([]);
  });

  it("flags zero_volume_halt when a replay-window day has zero volume", () => {
    const bars = cleanSeries(300);
    bars[265] = bar(bars[265].time, Number(bars[265].close), 0);
    const reasons = checkAnomalies({ bars, cutoffIndex: 260, requiredBefore: 250, requiredAfter: 20 });
    expect(reasons).toContain("zero_volume_halt");
  });

  it("does not flag zero volume outside the replay window", () => {
    const bars = cleanSeries(300);
    bars[10] = bar(bars[10].time, Number(bars[10].close), 0);
    const reasons = checkAnomalies({ bars, cutoffIndex: 260, requiredBefore: 250, requiredAfter: 20 });
    expect(reasons).toEqual([]);
  });
});
