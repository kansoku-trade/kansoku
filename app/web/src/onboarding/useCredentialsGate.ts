import { useCallback, useEffect } from "react";
import { useQuery } from "../apiHooks";
import { client } from "../client";
import { getDesktopCredentialsBridge, type CredentialsGetResult } from "../pages/settings/desktopCredentials";
import { clearRestricted } from "../restrictedMode";
import { getDesktopOnboardingBridge, type OnboardingState } from "./desktopOnboarding";
import { computeGateStatus, type GateStatus, type OnboardingStep } from "./gateStatus";

export function useCredentialsGate(): {
  status: GateStatus;
  step: OnboardingStep | null;
  bridge: ReturnType<typeof getDesktopCredentialsBridge>;
  details: CredentialsGetResult | null;
  recheck: () => void;
  completeOnboarding: () => Promise<void>;
} {
  const bridge = getDesktopCredentialsBridge();
  const onboardingBridge = getDesktopOnboardingBridge();

  const { data, loading, reload } = useQuery<CredentialsGetResult>(
    bridge ? "credentials.status" : null,
    () => client.credentials.status() as Promise<CredentialsGetResult>,
  );

  const { data: onboardingState, loading: onboardingLoading, reload: reloadOnboarding } = useQuery<OnboardingState>(
    onboardingBridge ? "onboarding.state" : null,
    () => onboardingBridge!.getState(),
  );

  useEffect(() => {
    if (data?.configured) clearRestricted();
  }, [data?.configured]);

  // Only block on the AI flag once Longbridge is actually connected — otherwise
  // a slow flag read would flash the main app before bouncing to the AI step.
  const statusLoading = loading || (data?.configured === true && onboardingLoading);

  const { status, step } = computeGateStatus({
    hasDesktopBridge: bridge !== null,
    statusLoading,
    configured: data ? data.configured : null,
    onboardingCompleted: onboardingBridge ? (onboardingState ? onboardingState.completed : null) : true,
  });

  const completeOnboarding = useCallback(async () => {
    if (onboardingBridge) await onboardingBridge.complete();
    reloadOnboarding();
  }, [onboardingBridge, reloadOnboarding]);

  return { status, step, bridge, details: data ?? null, recheck: reload, completeOnboarding };
}
