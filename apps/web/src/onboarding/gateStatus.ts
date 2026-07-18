export type GateStatus = "loading" | "onboarding" | "ready";
export type OnboardingStep = "longbridge" | "ai" | "twitter";

export interface GateResult {
  status: GateStatus;
  step: OnboardingStep | null;
}

// Two-track gate: Longbridge is a live check (a dropped CLI login yanks the
// user back to fix it at any time), while the AI step is a one-shot flag
// (`onboardingCompleted`) so skipping AI doesn't re-trap the user every launch.
// `configured === null` and `onboardingCompleted === null` both fail open to
// ready — a failed/absent probe should never trap someone out of the app.
export function computeGateStatus(params: {
  hasDesktopBridge: boolean;
  statusLoading: boolean;
  configured: boolean | null;
  onboardingCompleted: boolean | null;
}): GateResult {
  if (!params.hasDesktopBridge) return { status: "ready", step: null };
  if (params.statusLoading) return { status: "loading", step: null };
  if (params.configured === false) return { status: "onboarding", step: "longbridge" };
  if (params.configured === null) return { status: "ready", step: null };
  if (params.onboardingCompleted === false) return { status: "onboarding", step: "ai" };
  return { status: "ready", step: null };
}
