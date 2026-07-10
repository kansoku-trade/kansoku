import { describe, expect, it } from "vitest";
import { computeGateStatus } from "./gateStatus";

describe("computeGateStatus", () => {
  it("is ready immediately in a plain browser (no desktop bridge), regardless of everything else", () => {
    expect(
      computeGateStatus({ hasDesktopBridge: false, statusLoading: true, configured: false, skipped: false }),
    ).toBe("ready");
  });

  it("is loading while the desktop status request is in flight", () => {
    expect(
      computeGateStatus({ hasDesktopBridge: true, statusLoading: true, configured: null, skipped: false }),
    ).toBe("loading");
  });

  it("is ready when desktop and status reports configured:true (e.g. OAuth-only machine)", () => {
    expect(
      computeGateStatus({ hasDesktopBridge: true, statusLoading: false, configured: true, skipped: false }),
    ).toBe("ready");
  });

  it("fails open to ready when the status request itself failed (configured unknown)", () => {
    expect(
      computeGateStatus({ hasDesktopBridge: true, statusLoading: false, configured: null, skipped: false }),
    ).toBe("ready");
  });

  it("is onboarding when desktop, not configured, and not yet skipped", () => {
    expect(
      computeGateStatus({ hasDesktopBridge: true, statusLoading: false, configured: false, skipped: false }),
    ).toBe("onboarding");
  });

  it("is ready (restricted mode) when desktop, not configured, and the user skipped", () => {
    expect(
      computeGateStatus({ hasDesktopBridge: true, statusLoading: false, configured: false, skipped: true }),
    ).toBe("ready");
  });
});
