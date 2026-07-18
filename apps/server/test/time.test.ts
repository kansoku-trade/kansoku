import { describe, expect, it } from "vitest";
import { formatDateTimeInZone, localMarketTimeLabel, shouldShowLocalTime } from "@kansoku/shared/time";

describe("local market time labels", () => {
  const marketOpen = "2026-07-02T13:30:00Z";

  it("formats a market timestamp in an explicit local time zone", () => {
    expect(formatDateTimeInZone(marketOpen, "Asia/Singapore")).toMatch(/^2026-07-02 21:30 /);
  });

  it("shows a local label only when the local wall clock differs from New York", () => {
    expect(localMarketTimeLabel(marketOpen, "Asia/Singapore")).toMatch(/^2026-07-02 21:30 /);
    expect(shouldShowLocalTime(marketOpen, "Asia/Singapore")).toBe(true);
    expect(localMarketTimeLabel(marketOpen, "America/New_York")).toBeNull();
    expect(shouldShowLocalTime(marketOpen, "America/Toronto")).toBe(false);
  });
});
