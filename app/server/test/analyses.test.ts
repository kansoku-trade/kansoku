import { describe, expect, it } from "vitest";
import { publishAnalysisCreated, subscribeAnalyses } from "../src/realtime/analyses.js";

describe("analyses pub/sub", () => {
  it("delivers a published analysis-created event to the matching symbol", () => {
    const received: unknown[] = [];
    const unsub = subscribeAnalyses("NVDA.US", (envelope) => received.push(JSON.parse(envelope)));
    publishAnalysisCreated({ symbol: "NVDA.US", chartId: "2026-07-06-nvda-intraday" });
    expect(received).toEqual([{ type: "analysis-created", symbol: "NVDA.US", chartId: "2026-07-06-nvda-intraday" }]);
    unsub();
  });

  it("stops delivering after unsubscribe", () => {
    const received: unknown[] = [];
    const unsub = subscribeAnalyses("MRVL.US", (envelope) => received.push(JSON.parse(envelope)));
    unsub();
    publishAnalysisCreated({ symbol: "MRVL.US", chartId: "c1" });
    expect(received).toHaveLength(0);
  });

  it("isolates subscribers by symbol", () => {
    const nvda: unknown[] = [];
    const tsla: unknown[] = [];
    const unsubNvda = subscribeAnalyses("NVDA.US", (envelope) => nvda.push(JSON.parse(envelope)));
    const unsubTsla = subscribeAnalyses("TSLA.US", (envelope) => tsla.push(JSON.parse(envelope)));
    publishAnalysisCreated({ symbol: "NVDA.US", chartId: "c-nvda" });
    expect(nvda).toHaveLength(1);
    expect(tsla).toHaveLength(0);
    unsubNvda();
    unsubTsla();
  });

  it("no-ops when publishing to a symbol with no subscribers", () => {
    expect(() => publishAnalysisCreated({ symbol: "NOSUB.US", chartId: "c1" })).not.toThrow();
  });

  it("isolates a throwing subscriber from later subscribers", () => {
    const received: unknown[] = [];
    const unsubBad = subscribeAnalyses("BUS.US", () => {
      throw new Error("boom");
    });
    const unsubGood = subscribeAnalyses("BUS.US", (envelope) => received.push(JSON.parse(envelope)));
    expect(() => publishAnalysisCreated({ symbol: "BUS.US", chartId: "c1" })).not.toThrow();
    expect(received).toHaveLength(1);
    unsubBad();
    unsubGood();
  });
});
