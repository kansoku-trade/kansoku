export type GateStatus = 'loading' | 'onboarding' | 'ready';
export type OnboardingStep = 'longbridge' | 'ai' | 'twitter' | 'pro';

export interface GateResult {
  status: GateStatus;
  step: OnboardingStep | null;
}

// Three-track gate: Longbridge is a live check by default (a dropped CLI
// login yanks the user back to fix it at any time). `longbridgeSkipped` mutes
// that live check while unconfigured — once a user explicitly skips, a later
// dropped CLI login does NOT re-trap them; the skip stays persisted even
// across a future connect-then-disconnect cycle. The AI step is a one-shot
// flag (`onboardingCompleted`) so skipping AI doesn't re-trap the user every
// launch. `configured === null` and `onboardingCompleted === null` both fail
// open to ready — a failed/absent probe should never trap someone out of the
// app. `longbridgeSkipped === null` fails closed (treated as not skipped) —
// an unknown skip flag must not silently bypass the live check.
export function computeGateStatus(params: {
  hasDesktopBridge: boolean;
  statusLoading: boolean;
  configured: boolean | null;
  onboardingCompleted: boolean | null;
  longbridgeSkipped: boolean | null;
}): GateResult {
  if (!params.hasDesktopBridge) return { status: 'ready', step: null };
  if (params.statusLoading) return { status: 'loading', step: null };
  if (params.configured === false && params.longbridgeSkipped !== true) {
    return { status: 'onboarding', step: 'longbridge' };
  }
  if (params.configured === null) return { status: 'ready', step: null };
  if (params.onboardingCompleted === false) return { status: 'onboarding', step: 'ai' };
  return { status: 'ready', step: null };
}

export function computeStatusLoading(params: {
  credentialsLoading: boolean;
  configured: boolean | null;
  onboardingLoading: boolean;
}): boolean {
  if (params.credentialsLoading) return true;
  if (params.configured === null) return false;
  return params.onboardingLoading;
}
