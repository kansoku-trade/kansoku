import { describe, expect, it, vi } from "vitest";

vi.mock("../src/services/sepa.js", () => ({
  buildSepa: vi.fn((input: { symbol: string; as_of_date?: string }) => ({
    built: {
      kind: "sepa",
      sidebar: { symbol: input.symbol, asOf: input.as_of_date ?? "2026-07-14T16:00:00Z", name: input.symbol },
    },
    meta: {},
  })),
}));

vi.mock("../src/services/intraday.js", () => ({
  buildIntraday: vi.fn((input: { symbol: string }) => ({
    built: { kind: "intraday", sidebar: { symbol: input.symbol, asOf: "2026-07-14T16:00:00Z", name: input.symbol } },
    meta: {},
  })),
  TIMEFRAME_ORDER: ["m5", "m15", "h1"],
}));

const { rebuild } = await import("../src/services/build.js");

describe("rebuild sepa/intraday: sessionDate is market-local, not UTC-sliced", () => {
  it("resolves a HK day bar stamped at market-local midnight (16:00Z prior day) to the correct HK session date", () => {
    const result = rebuild("sepa", { symbol: "700.HK" });
    expect(result.sessionDate).toBe("2026-07-15");
  });

  it("keeps the US session date unaffected by the market-local conversion", () => {
    const result = rebuild("sepa", { symbol: "MU.US" });
    expect(result.sessionDate).toBe("2026-07-14");
  });

  it("applies the same market-local conversion to the intraday chart's sessionDate", () => {
    const result = rebuild("intraday", { symbol: "700.HK" });
    expect(result.sessionDate).toBe("2026-07-15");
  });

  it("returns a date-only as_of_date verbatim, without a UTC-midnight timezone slip (US)", () => {
    const result = rebuild("sepa", { symbol: "MU.US", as_of_date: "2026-07-15" });
    expect(result.sessionDate).toBe("2026-07-15");
  });
});
