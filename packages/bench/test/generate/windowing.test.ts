import { describe, expect, it } from "vitest";
import {
  firstIndexOnOrAfter,
  hasSufficientWeekHistory,
  lastCompletedWeekIndex,
  planCutoffIndices,
} from "../../src/generate/windowing.js";

function bar(time: string) {
  return { time, open: "1", high: "1", low: "1", close: "1", volume: "1" };
}

describe("firstIndexOnOrAfter", () => {
  it("finds the first bar on or after the threshold date", () => {
    const bars = [bar("2025-12-30"), bar("2025-12-31"), bar("2026-01-01"), bar("2026-01-02")];
    expect(firstIndexOnOrAfter(bars, "2026-01-01")).toBe(2);
  });

  it("returns bars.length when nothing qualifies", () => {
    const bars = [bar("2025-01-01"), bar("2025-01-02")];
    expect(firstIndexOnOrAfter(bars, "2026-01-01")).toBe(2);
  });
});

describe("planCutoffIndices", () => {
  it("spaces windows so replay ranges never overlap", () => {
    const indices = planCutoffIndices({
      totalBars: 400,
      requiredBefore: 250,
      requiredAfter: 20,
      windowsPerSymbol: 3,
      minCandidateIndex: 250,
    });
    expect(indices.length).toBe(3);
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i] - indices[i - 1]).toBeGreaterThanOrEqual(20);
    }
    for (const idx of indices) {
      expect(idx).toBeGreaterThanOrEqual(249);
      expect(idx).toBeLessThanOrEqual(400 - 1 - 20);
    }
  });

  it("returns fewer windows when history is short", () => {
    const indices = planCutoffIndices({
      totalBars: 280,
      requiredBefore: 250,
      requiredAfter: 20,
      windowsPerSymbol: 3,
      minCandidateIndex: 0,
    });
    expect(indices.length).toBeLessThan(3);
    expect(indices.length).toBeGreaterThan(0);
  });

  it("returns an empty array when there isn't enough history at all", () => {
    const indices = planCutoffIndices({
      totalBars: 100,
      requiredBefore: 250,
      requiredAfter: 20,
      windowsPerSymbol: 3,
      minCandidateIndex: 0,
    });
    expect(indices).toEqual([]);
  });

  it("honors minCandidateIndex as a floor on the earliest cutoff", () => {
    const indices = planCutoffIndices({
      totalBars: 400,
      requiredBefore: 250,
      requiredAfter: 20,
      windowsPerSymbol: 1,
      minCandidateIndex: 300,
    });
    expect(indices).toEqual([379]);
  });

  it("is deterministic across repeated calls", () => {
    const input = { totalBars: 500, requiredBefore: 250, requiredAfter: 20, windowsPerSymbol: 3, minCandidateIndex: 260 };
    expect(planCutoffIndices(input)).toEqual(planCutoffIndices(input));
  });
});

function weekBar(mondayIso: string) {
  return bar(mondayIso);
}

describe("lastCompletedWeekIndex", () => {
  it("excludes the week containing the cutoff date", () => {
    const weeks = [weekBar("2026-03-02"), weekBar("2026-03-09"), weekBar("2026-03-16")];
    expect(lastCompletedWeekIndex(weeks, "2026-03-18")).toBe(1);
  });

  it("returns -1 when no week is fully completed before the cutoff", () => {
    const weeks = [weekBar("2026-03-16")];
    expect(lastCompletedWeekIndex(weeks, "2026-03-17")).toBe(-1);
  });
});

describe("hasSufficientWeekHistory", () => {
  it("is true when enough completed weeks precede the cutoff", () => {
    const weeks = Array.from({ length: 10 }, (_, i) => weekBar(`2026-01-${String(i + 1).padStart(2, "0")}`));
    expect(hasSufficientWeekHistory(weeks, "2026-03-18", 5)).toBe(true);
  });

  it("is false when there are too few completed weeks", () => {
    const weeks = [weekBar("2026-03-09")];
    expect(hasSufficientWeekHistory(weeks, "2026-03-18", 5)).toBe(false);
  });
});
