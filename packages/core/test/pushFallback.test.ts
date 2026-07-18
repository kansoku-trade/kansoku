import { describe, expect, it } from "vitest";
import {
  baseIntervalMs,
  isPushFresh,
  OVERNIGHT_POLL_MS,
  PRE_POST_POLL_MS,
  pollIntervalMs,
  REGULAR_POLL_MS,
} from "../src/realtime/pushFallback.js";

describe("baseIntervalMs", () => {
  it("maps each session to its tier", () => {
    expect(baseIntervalMs("regular")).toBe(REGULAR_POLL_MS);
    expect(baseIntervalMs("pre")).toBe(PRE_POST_POLL_MS);
    expect(baseIntervalMs("post")).toBe(PRE_POST_POLL_MS);
    expect(baseIntervalMs("overnight")).toBe(OVERNIGHT_POLL_MS);
  });
});

describe("isPushFresh", () => {
  it("is false when no push has ever arrived", () => {
    expect(isPushFresh(null, 10_000, 3_000)) .toBe(false);
  });
  it("is true within the fresh window", () => {
    expect(isPushFresh(9_000, 10_000, 3_000)).toBe(true);
  });
  it("is false past the fresh window", () => {
    expect(isPushFresh(5_000, 10_000, 3_000)).toBe(false);
  });
});

describe("pollIntervalMs", () => {
  it("falls back to the session tier when no recent push", () => {
    expect(pollIntervalMs(null, 10_000, "regular", 3_000)).toBe(REGULAR_POLL_MS);
  });

  it("widens to the overnight tier while pushes are flowing, regardless of session", () => {
    expect(pollIntervalMs(9_000, 10_000, "regular", 3_000)).toBe(OVERNIGHT_POLL_MS);
    expect(pollIntervalMs(9_000, 10_000, "pre", 3_000)).toBe(OVERNIGHT_POLL_MS);
  });

  it("reverts to the session tier once the push goes stale", () => {
    expect(pollIntervalMs(1_000, 10_000, "regular", 3_000)).toBe(REGULAR_POLL_MS);
  });
});
