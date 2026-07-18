import type { OnboardingStep } from './gateStatus';

export function resolveRenderStep(
  gateStep: OnboardingStep,
  localStep: OnboardingStep,
): OnboardingStep {
  // Longbridge always wins over local progress: a dropped CLI login yanks the user back to fix it.
  if (gateStep === 'longbridge') return 'longbridge';
  return localStep;
}
