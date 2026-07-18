import { describe, expect, it } from "vitest";
import {
  applyAnalysisBroadcast,
  INITIAL_FEED_STATE,
  type AnalysisFeedState,
} from "../../../packages/shared/analysisFeed.js";

const broadcast = (overrides: Partial<{ symbol: string; chartId: string; chartType: string }> = {}) => ({
  symbol: "MU.US",
  chartId: "2026-07-06-mu-intraday",
  chartType: "intraday",
  ...overrides,
});

describe("applyAnalysisBroadcast", () => {
  it("latest mode adopts an intraday broadcast for the same symbol", () => {
    const next = applyAnalysisBroadcast(INITIAL_FEED_STATE, "MU.US", null, broadcast());
    expect(next).toEqual<AnalysisFeedState>({ latestId: "2026-07-06-mu-intraday", newerId: null });
  });

  it("pinned mode does not switch, and records the hint state instead", () => {
    const next = applyAnalysisBroadcast(INITIAL_FEED_STATE, "MU.US", "2026-07-01-mu-intraday", broadcast());
    expect(next).toEqual<AnalysisFeedState>({ latestId: null, newerId: "2026-07-06-mu-intraday" });
  });

  it("ignores a non-intraday broadcast in latest mode", () => {
    const next = applyAnalysisBroadcast(INITIAL_FEED_STATE, "MU.US", null, broadcast({ chartType: "sepa" }));
    expect(next).toEqual(INITIAL_FEED_STATE);
  });

  it("ignores a non-intraday broadcast in pinned mode", () => {
    const next = applyAnalysisBroadcast(
      INITIAL_FEED_STATE,
      "MU.US",
      "2026-07-01-mu-intraday",
      broadcast({ chartType: "sepa" }),
    );
    expect(next).toEqual(INITIAL_FEED_STATE);
  });

  it("ignores a broadcast for a different symbol", () => {
    const next = applyAnalysisBroadcast(INITIAL_FEED_STATE, "NVDA.US", null, broadcast());
    expect(next).toEqual(INITIAL_FEED_STATE);
  });

  it("normalizes the exchange suffix when comparing symbols", () => {
    const next = applyAnalysisBroadcast(INITIAL_FEED_STATE, "mu", null, broadcast({ symbol: "MU.US" }));
    expect(next).toEqual<AnalysisFeedState>({ latestId: "2026-07-06-mu-intraday", newerId: null });
  });
});
