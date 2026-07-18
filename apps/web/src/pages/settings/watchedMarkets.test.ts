import { describe, expect, it } from "vitest";
import { toggleMarket } from "./watchedMarkets";

describe("toggleMarket", () => {
  it("adds a market when checking it on", () => {
    expect(toggleMarket(["US"], "HK", true)).toEqual(["US", "HK"]);
  });

  it("is a no-op when checking on a market already selected", () => {
    expect(toggleMarket(["US", "HK"], "HK", true)).toEqual(["US", "HK"]);
  });

  it("removes a market when unchecking it, if others remain", () => {
    expect(toggleMarket(["US", "HK"], "HK", false)).toEqual(["US"]);
  });

  it("refuses to unselect the last remaining market", () => {
    expect(toggleMarket(["US"], "US", false)).toBeNull();
  });

  it("is a no-op when unchecking a market that isn't selected", () => {
    expect(toggleMarket(["US"], "HK", false)).toEqual(["US"]);
  });
});
