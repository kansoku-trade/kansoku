import { describe, expect, it } from "vitest";
import { normalizeQuote, type RawQuote } from "../src/realtime/quotes.js";

const MU: RawQuote = {
  symbol: "MU.US",
  last: "1032.280",
  prev_close: "1154.290",
  change_percentage: "-10.57",
  overnight: {
    last: "1001.740",
    prev_close: "1032.280",
    timestamp: "2026-07-02T07:59:56Z",
  },
  post_market: {
    last: "1020.100",
    prev_close: "1032.280",
    timestamp: "2026-07-01T23:59:59Z",
  },
  pre_market: {
    last: "1004.857",
    prev_close: "1032.280",
    timestamp: "2026-07-02T08:02:42Z",
  },
};

describe("normalizeQuote", () => {
  it("picks the freshest extended session (pre-market beats overnight)", () => {
    const now = Date.parse("2026-07-02T08:05:00Z");
    const cell = normalizeQuote(MU, now);
    expect(cell.session).toBe("盘前");
    expect(cell.last).toBeCloseTo(1004.857);
    expect(cell.pct).toBeCloseTo((1004.857 / 1032.28 - 1) * 100, 6);
    expect(cell.regularLast).toBeCloseTo(1032.28);
    expect(cell.regularPct).toBeCloseTo(-10.57);
  });

  it("falls back to regular session when extended data is stale", () => {
    const now = Date.parse("2026-07-02T15:00:00Z");
    const cell = normalizeQuote(MU, now);
    expect(cell.session).toBe("日盘");
    expect(cell.last).toBeCloseTo(1032.28);
    expect(cell.pct).toBeCloseTo(-10.57);
  });

  it("labels a closed HK quote as 休市 during US regular hours, not 日盘", () => {
    const hk: RawQuote = {
      symbol: "700.HK",
      last: "500.0",
      prev_close: "510.0",
      change_percentage: "-1.96",
    };
    const now = Date.parse("2026-07-02T15:00:00Z");
    const cell = normalizeQuote(hk, now);
    expect(cell.session).toBe("休市");
    expect(cell.last).toBeCloseTo(500);
    expect(cell.regularLast).toBeCloseTo(500);
  });

  it("handles quotes without extended sessions", () => {
    const bare: RawQuote = {
      symbol: "SPY.US",
      last: "620.00",
      prev_close: "624.00",
      change_percentage: "-0.64",
    };
    const cell = normalizeQuote(bare, Date.now());
    expect(cell.session).toBe("日盘");
    expect(cell.last).toBe(620);
  });
});
