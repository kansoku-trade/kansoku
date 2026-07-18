import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawBar } from "@kansoku/shared/types";

const usProvider = vi.hoisted(() => ({
  name: "us",
  capabilities: new Set<string>(),
  getKline: vi.fn(),
  getQuotes: vi.fn(),
  getNews: vi.fn().mockResolvedValue([]),
}));

const hkProvider = vi.hoisted(() => ({
  name: "hk",
  capabilities: new Set<string>(),
  getKline: vi.fn(),
  getQuotes: vi.fn(),
  getNews: vi.fn().mockResolvedValue([]),
}));

vi.mock("../src/services/marketdata/registry.js", () => ({
  getProvider: (market: string) => (market === "HK" ? hkProvider : usProvider),
}));

vi.mock("../src/services/sepa.js", () => ({
  buildSepa: vi.fn().mockReturnValue({
    built: { kind: "sepa", sidebar: { symbol: "700.HK", asOf: "2026-07-08T00:00:00Z", name: "700.HK" } },
    meta: {},
  }),
}));

const { buildChart } = await import("../src/services/build.js");

function bars(): RawBar[] {
  return [{ time: "2026-07-08T00:00:00Z", open: 1, high: 1, low: 1, close: 1, volume: 1 }];
}

describe("buildChart sepa: SPY relative-strength baseline always routes through the US provider", () => {
  beforeEach(() => {
    usProvider.getKline.mockReset().mockResolvedValue(bars());
    hkProvider.getKline.mockReset().mockResolvedValue(bars());
  });

  it("fetches the primary HK symbol's kline from the HK provider and SPY.US from the US provider", async () => {
    await buildChart({ type: "sepa", symbol: "700.HK", count: 5 });

    expect(hkProvider.getKline).toHaveBeenCalledWith("700.HK", "day", 5);
    expect(usProvider.getKline).toHaveBeenCalledWith("SPY.US", "day", 5);
    expect(hkProvider.getKline).not.toHaveBeenCalledWith("SPY.US", "day", 5);
  });

  it("still routes SPY.US through the US provider for a US primary symbol", async () => {
    await buildChart({ type: "sepa", symbol: "MU.US", count: 5 });

    expect(usProvider.getKline).toHaveBeenCalledWith("MU.US", "day", 5);
    expect(usProvider.getKline).toHaveBeenCalledWith("SPY.US", "day", 5);
  });

  it("skips the SPY fetch entirely when skip_spy is set", async () => {
    await buildChart({ type: "sepa", symbol: "700.HK", count: 5, skip_spy: true });

    expect(usProvider.getKline).not.toHaveBeenCalledWith("SPY.US", "day", 5);
  });
});
