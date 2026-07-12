import { describe, expect, it } from "vitest";
import { computeGateStatus } from "./gateStatus";

const base = { hasDesktopBridge: true, statusLoading: false, configured: true, onboardingCompleted: true };

describe("computeGateStatus", () => {
  it("is ready immediately in a plain browser (no desktop bridge), regardless of everything else", () => {
    expect(
      computeGateStatus({ ...base, hasDesktopBridge: false, statusLoading: true, configured: false, onboardingCompleted: false }),
    ).toEqual({ status: "ready", step: null });
  });

  it("is loading while the desktop status request is in flight", () => {
    expect(computeGateStatus({ ...base, statusLoading: true, configured: null, onboardingCompleted: null })).toEqual({
      status: "loading",
      step: null,
    });
  });

  it("onboards at the longbridge step when the CLI is not ready", () => {
    expect(computeGateStatus({ ...base, configured: false, onboardingCompleted: true })).toEqual({
      status: "onboarding",
      step: "longbridge",
    });
  });

  it("fails open to ready when the credentials request itself failed (configured unknown)", () => {
    expect(computeGateStatus({ ...base, configured: null })).toEqual({ status: "ready", step: null });
  });

  it("onboards at the ai step when longbridge is ready but onboarding was never completed", () => {
    expect(computeGateStatus({ ...base, configured: true, onboardingCompleted: false })).toEqual({
      status: "onboarding",
      step: "ai",
    });
  });

  it("is ready once longbridge is ready and onboarding is completed", () => {
    expect(computeGateStatus({ ...base, configured: true, onboardingCompleted: true })).toEqual({
      status: "ready",
      step: null,
    });
  });

  it("fails open to ready when the onboarding flag is unknown (bridge missing / read failed)", () => {
    expect(computeGateStatus({ ...base, configured: true, onboardingCompleted: null })).toEqual({
      status: "ready",
      step: null,
    });
  });

  it("never returns the twitter step — the gate has no per-step knowledge of it", () => {
    const cases = [
      { ...base, hasDesktopBridge: false },
      { ...base, statusLoading: true, configured: null, onboardingCompleted: null },
      { ...base, configured: false },
      { ...base, configured: null },
      { ...base, configured: true, onboardingCompleted: false },
      { ...base, configured: true, onboardingCompleted: true },
      { ...base, configured: true, onboardingCompleted: null },
    ];
    for (const params of cases) expect(computeGateStatus(params).step).not.toBe("twitter");
  });
});
