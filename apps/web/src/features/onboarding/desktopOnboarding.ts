import { getShellRpc } from '../desktop/shellRpc';

export interface OnboardingState {
  completed: boolean;
  longbridgeSkipped: boolean;
}

export interface DesktopOnboardingBridge {
  getState(): Promise<OnboardingState>;
  complete(): Promise<OnboardingState>;
  skipLongbridge(): Promise<OnboardingState>;
}

export function getDesktopOnboardingBridge(
  win: unknown = typeof window === 'undefined' ? undefined : window,
): DesktopOnboardingBridge | null {
  const rpc = getShellRpc(win);
  if (!rpc) return null;
  return {
    getState: () => rpc.invoke('onboarding.getState') as Promise<OnboardingState>,
    complete: () => rpc.invoke('onboarding.complete') as Promise<OnboardingState>,
    skipLongbridge: () => rpc.invoke('onboarding.skipLongbridge') as Promise<OnboardingState>,
  };
}
