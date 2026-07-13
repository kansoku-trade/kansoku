import { describe, expect, it } from "vitest";
import { resolveMarketTimePresentation } from "./MarketTime";

describe("MarketTime display priority", () => {
  const marketOpen = "2026-07-02T13:30:00Z";

  it("keeps Eastern Time primary by default and exposes local time second", () => {
    const result = resolveMarketTimePresentation({
      value: marketOpen,
      preference: "market",
      timeZone: "Asia/Singapore",
    });

    expect(result.label).toBe("2026-07-02 09:30 ET");
    expect(result.tooltip).toMatch(/^本地时间 2026-07-02 21:30 /);
  });

  it("puts local time first and moves Eastern Time into the tooltip", () => {
    const result = resolveMarketTimePresentation({
      value: marketOpen,
      preference: "local",
      timeZone: "Asia/Singapore",
    });

    expect(result.label).toMatch(/^2026-07-02 21:30 /);
    expect(result.tooltip).toBe("美东时间 2026-07-02 09:30 ET");
  });

  it("preserves the requested compact format for a local-first label", () => {
    const result = resolveMarketTimePresentation({
      value: marketOpen,
      preference: "local",
      timeZone: "Asia/Singapore",
      format: "clock",
    });

    expect(result.label).toBe("21:30");
    expect(result.tooltip).toBe("美东时间 2026-07-02 09:30 ET");
  });

  it("does not add a redundant tooltip when both zones share the wall clock", () => {
    expect(
      resolveMarketTimePresentation({
        value: marketOpen,
        preference: "local",
        timeZone: "America/Toronto",
      }),
    ).toEqual({ label: "2026-07-02 09:30 ET", tooltip: null });
  });
});
