export interface OnboardingState {
  completed: boolean;
}

export interface DesktopOnboardingBridge {
  getState(): Promise<OnboardingState>;
  complete(): Promise<OnboardingState>;
}

interface DesktopGlobal {
  onboarding?: DesktopOnboardingBridge;
}

export function getDesktopOnboardingBridge(
  win: unknown = typeof window === "undefined" ? undefined : window,
): DesktopOnboardingBridge | null {
  return (win as { desktop?: DesktopGlobal } | undefined)?.desktop?.onboarding ?? null;
}
