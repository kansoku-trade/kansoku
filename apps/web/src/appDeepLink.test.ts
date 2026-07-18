import { describe, expect, it } from "vitest";
import { parseAppDeepLink } from "@kansoku/shared/appDeepLink";

describe("parseAppDeepLink", () => {
  it("converts a durable localhost analysis link into an environment-independent route", () => {
    expect(
      parseAppDeepLink("http://localhost:5199/symbol/DRAM.US?analysis=2026-07-09-dram-intraday-3"),
    ).toEqual({
      kind: "symbol-analysis",
      route: "/symbol/DRAM.US?analysis=2026-07-09-dram-intraday-3",
      symbol: "DRAM.US",
      analysisId: "2026-07-09-dram-intraday-3",
    });
  });

  it("recognizes cockpit links across legacy, relative, and packaged origins", () => {
    expect(parseAppDeepLink("http://127.0.0.1:5199/symbol/MU.US")?.route).toBe("/symbol/MU.US");
    expect(parseAppDeepLink("/symbol/MU.US")?.route).toBe("/symbol/MU.US");
    expect(parseAppDeepLink("app://-/symbol/MU.US")?.route).toBe("/symbol/MU.US");
  });

  it("preserves the explicit live cockpit mode", () => {
    expect(parseAppDeepLink("/symbol/MU.US?view=live")?.route).toBe("/symbol/MU.US?view=live");
  });

  it("normalizes legacy chart-id links so the existing chart redirect can resolve them", () => {
    expect(parseAppDeepLink("http://localhost:5199/charts/2026-07-06-mu-intraday-2")).toEqual({
      kind: "chart",
      route: "/charts/2026-07-06-mu-intraday-2",
      chartId: "2026-07-06-mu-intraday-2",
    });
  });

  it("does not reclassify external or wrong-port links as app routes", () => {
    expect(parseAppDeepLink("https://example.com/symbol/MU.US")).toBeNull();
    expect(parseAppDeepLink("http://localhost:9999/symbol/MU.US")).toBeNull();
    expect(parseAppDeepLink("http://localhost:5199/settings")).toBeNull();
  });
});
