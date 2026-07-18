import { describe, expect, it } from "vitest";
import type { IntradayBuilt, QuoteCell } from "../../../../../packages/shared/types";
import { resolveSidebarQuote } from "./IntradaySidebar";

const sidebar = {
  symbol: "NOW.US",
  last: 110,
  asOf: "2026-07-13T19:00:00.000Z",
} as IntradayBuilt["sidebar"];

function quote(overrides: Partial<QuoteCell> = {}): QuoteCell {
  return {
    symbol: "NOW.US",
    session: "日盘",
    last: 111.35,
    pct: 3.38,
    regularLast: 111.35,
    regularPct: 3.38,
    asOf: "2026-07-13T19:36:07.000Z",
    ...overrides,
  };
}

describe("resolveSidebarQuote", () => {
  it("keeps the persisted snapshot when no live quote is supplied", () => {
    expect(resolveSidebarQuote(sidebar)).toEqual({ last: 110, asOf: "2026-07-13T19:00:00.000Z" });
  });

  it("uses the matching live quote price and broker timestamp", () => {
    expect(resolveSidebarQuote(sidebar, quote())).toEqual({
      last: 111.35,
      asOf: "2026-07-13T19:36:07.000Z",
    });
  });

  it("ignores a quote for another symbol", () => {
    expect(resolveSidebarQuote(sidebar, quote({ symbol: "NVDA.US" }))).toEqual({
      last: 110,
      asOf: "2026-07-13T19:00:00.000Z",
    });
  });
});
