import { describe, expect, it } from "vitest";
import { drainBudget, MAX_RATE_CPS, MIN_RATE_CPS, safeCut, TARGET_LAG_MS } from "./smoothStreamPacing";

describe("drainBudget", () => {
  it("returns 0 for an empty buffer or no elapsed time", () => {
    expect(drainBudget(0, 16)).toBe(0);
    expect(drainBudget(100, 0)).toBe(0);
  });

  it("never exceeds the backlog", () => {
    expect(drainBudget(3, 10_000)).toBe(3);
  });

  it("drains a small backlog at least at the minimum rate", () => {
    const perSecond = drainBudget(5, 1000);
    expect(perSecond).toBeGreaterThanOrEqual(5);
  });

  it("targets roughly the configured lag for a moderate backlog", () => {
    const backlog = 200;
    const budget = drainBudget(backlog, TARGET_LAG_MS);
    expect(budget).toBe(backlog);
  });

  it("caps huge backlogs so a full answer replays within a few seconds", () => {
    const backlog = 3000;
    const perSecond = drainBudget(backlog, 1000);
    expect(perSecond).toBe(MAX_RATE_CPS);
    expect(backlog / perSecond).toBeLessThanOrEqual(3);
  });

  it("scales with elapsed time", () => {
    expect(drainBudget(400, 32)).toBeGreaterThan(drainBudget(400, 16));
  });

  it("keeps a trickle alive between deltas", () => {
    expect(drainBudget(1, 16)).toBeGreaterThan(0);
    expect(MIN_RATE_CPS).toBeGreaterThan(0);
  });
});

describe("safeCut", () => {
  it("returns the full length when count covers the text", () => {
    expect(safeCut("abc", 5)).toBe(3);
  });

  it("cuts plain text exactly at count", () => {
    expect(safeCut("hello", 2)).toBe(2);
  });

  it("does not split a surrogate pair", () => {
    const text = "a😀b";
    expect(safeCut(text, 2)).toBe(3);
    expect(text.slice(0, safeCut(text, 2))).toBe("a😀");
  });

  it("cuts CJK text per character", () => {
    expect(safeCut("涨跌互现", 2)).toBe(2);
  });
});
