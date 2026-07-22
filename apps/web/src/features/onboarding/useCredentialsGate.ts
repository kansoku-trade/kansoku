import { useCallback, useEffect } from 'react';
import { useQuery } from '../../lib/apiHooks';
import { client } from '../../lib/client';
import {
  getDesktopCredentialsBridge,
  type CredentialsGetResult,
} from '../settings/desktopCredentials';
import { refreshCapabilities } from '../edition/capabilitiesStore';
import { clearRestricted } from '../edition/restrictedMode';
import { getDesktopOnboardingBridge, type OnboardingState } from './desktopOnboarding';
import {
  computeGateStatus,
  computeStatusLoading,
  type GateStatus,
  type OnboardingStep,
} from './gateStatus';

export function useCredentialsGate(): {
  status: GateStatus;
  step: OnboardingStep | null;
  bridge: ReturnType<typeof getDesktopCredentialsBridge>;
  details: CredentialsGetResult | null;
  recheck: () => void;
  completeOnboarding: () => Promise<void>;
  skipLongbridge: () => Promise<void>;
} {
  const bridge = getDesktopCredentialsBridge();
  const onboardingBridge = getDesktopOnboardingBridge();

  const { data, loading, reload } = useQuery<CredentialsGetResult>(
    bridge ? 'credentials.status' : null,
    () => client.credentials.status() as Promise<CredentialsGetResult>,
  );

  const {
    data: onboardingState,
    loading: onboardingLoading,
    reload: reloadOnboarding,
  } = useQuery<OnboardingState>(onboardingBridge ? 'onboarding.state' : null, () =>
    onboardingBridge!.getState(),
  );

  useEffect(() => {
    if (data?.configured) {
      clearRestricted();
      void refreshCapabilities();
    }
  }, [data?.configured]);

  const statusLoading = computeStatusLoading({
    credentialsLoading: loading,
    configured: data ? data.configured : null,
    onboardingLoading,
  });

  const { status, step } = computeGateStatus({
    hasDesktopBridge: bridge !== null,
    statusLoading,
    configured: data ? data.configured : null,
    onboardingCompleted: onboardingBridge
      ? onboardingState
        ? onboardingState.completed
        : null
      : true,
    longbridgeSkipped: onboardingBridge
      ? onboardingState
        ? onboardingState.longbridgeSkipped
        : null
      : false,
  });

  const completeOnboarding = useCallback(async () => {
    if (onboardingBridge) await onboardingBridge.complete();
    reloadOnboarding();
  }, [onboardingBridge, reloadOnboarding]);

  const skipLongbridge = useCallback(async () => {
    if (onboardingBridge) await onboardingBridge.skipLongbridge();
    reloadOnboarding();
  }, [onboardingBridge, reloadOnboarding]);

  return {
    status,
    step,
    bridge,
    details: data ?? null,
    recheck: reload,
    completeOnboarding,
    skipLongbridge,
  };
}
