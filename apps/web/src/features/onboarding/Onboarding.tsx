import { useState } from 'react';
import { useCapabilities } from '../edition/capabilitiesStore';
import type { CredentialsGetResult } from '../settings/desktopCredentials';
import type { OnboardingStep } from './gateStatus';
import { resolveRenderStep } from './stepResolution';
import { StepAi } from './StepAi';
import { StepLongbridge } from './StepLongbridge';
import { StepPro } from './StepPro';
import { StepTwitter } from './StepTwitter';

const BASE_STEPS: { key: OnboardingStep; label: string }[] = [
  { key: 'longbridge', label: '连接数据' },
  { key: 'ai', label: '配置 AI' },
  { key: 'twitter', label: '连接 X' },
];
const PRO_STEP: { key: OnboardingStep; label: string } = { key: 'pro', label: 'Kansoku AI' };

const KANSOKU_MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 134" aria-hidden="true"><path d="M18 36 C60 19 115 22 162 44" fill="none" stroke="#E2E8F0" stroke-opacity="0.34" stroke-width="3" stroke-linecap="round"/><path d="M18 67 C61 54 112 57 162 67" fill="none" stroke="#FACC15" stroke-width="4.2" stroke-linecap="round"/><path d="M18 100 C64 119 116 113 162 86" fill="none" stroke="#E2E8F0" stroke-opacity="0.34" stroke-width="3" stroke-linecap="round"/><circle cx="124" cy="63" r="7.8" fill="#FEF08A"/></svg>`;

function Brand() {
  return (
    <header className="onboarding-brand">
      <span
        className="onboarding-brand-mark"
        dangerouslySetInnerHTML={{ __html: KANSOKU_MARK_SVG }}
      />
      <div className="onboarding-brand-text">
        <span className="onboarding-brand-name">Kansoku</span>
        <span className="onboarding-brand-tag">OBSERVED PATH</span>
      </div>
    </header>
  );
}

function Progress({
  step,
  steps,
}: {
  step: OnboardingStep;
  steps: { key: OnboardingStep; label: string }[];
}) {
  const activeIndex = steps.findIndex((s) => s.key === step);
  return (
    <ol className="onboarding-progress">
      {steps.map((s, i) => {
        const cls = i < activeIndex ? ' is-done' : i === activeIndex ? ' is-active' : '';
        return (
          <li key={s.key} className={'onboarding-progress-step' + cls}>
            <span className="onboarding-progress-index">{i < activeIndex ? '✓' : i + 1}</span>
            <span className="onboarding-progress-label">{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function Onboarding({
  step,
  status,
  onRecheck,
  onComplete,
  onSkipLongbridge,
}: {
  step: OnboardingStep;
  status: CredentialsGetResult | null;
  onRecheck: () => void;
  onComplete: () => Promise<void>;
  onSkipLongbridge: () => Promise<void>;
}) {
  const [localStep, setLocalStep] = useState<OnboardingStep>(step === 'longbridge' ? 'ai' : step);
  const renderStep = resolveRenderStep(step, localStep);
  const { pro, licensed } = useCapabilities();
  const offerPro = (pro && !licensed) || renderStep === 'pro';
  const steps = offerPro ? [...BASE_STEPS, PRO_STEP] : BASE_STEPS;

  return (
    <>
      <div className="onboarding-drag-bar" aria-hidden="true">
        <div className="desktop-titlebar-traffic-spacer" />
      </div>
      <div className="page onboarding-page">
        <div className="onboarding-shell">
          <Brand />
          <Progress step={renderStep} steps={steps} />
          {renderStep === 'longbridge' ? (
            <StepLongbridge status={status} onRecheck={onRecheck} onSkip={onSkipLongbridge} />
          ) : renderStep === 'ai' ? (
            <StepAi onNext={() => setLocalStep('twitter')} />
          ) : renderStep === 'twitter' ? (
            <StepTwitter onComplete={offerPro ? async () => setLocalStep('pro') : onComplete} />
          ) : (
            <StepPro onComplete={onComplete} />
          )}
        </div>
      </div>
    </>
  );
}
