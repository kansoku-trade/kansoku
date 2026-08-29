import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useCapabilities } from '../edition/capabilitiesStore';
import type { CredentialsGetResult } from '../settings/desktopCredentials';
import { colors, fontSizes, radii } from '../../theme/tokens.stylex';
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

const styles = stylex.create({
  dragBar: {
    alignItems: 'center',
    backgroundColor: colors.backgroundCanvas,
    display: 'flex',
    height: '40px',
    left: 0,
    position: 'fixed',
    right: 0,
    top: 0,
    WebkitAppRegion: 'drag',
    zIndex: 80,
  },
  page: {
    alignItems: 'center',
    backgroundColor: colors.backgroundCanvas,
    display: 'flex',
    justifyContent: 'center',
    margin: 0,
    maxWidth: 'none',
    minHeight: '100vh',
    padding: '40px 24px 24px',
    width: '100%',
  },
  shell: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    maxWidth: '480px',
    width: '100%',
  },
  brand: {
    alignItems: 'center',
    display: 'flex',
    gap: '14px',
    justifyContent: 'center',
    padding: '4px 0 2px',
  },
  brandMark: {
    display: 'block',
    filter: 'drop-shadow(0 0 18px rgb(250 204 21 / 0.18))',
    flex: 'none',
    height: '42px',
    width: '56px',
  },
  brandMarkSvg: {
    display: 'block',
    height: '100%',
    width: '100%',
  },
  brandText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    minWidth: 0,
  },
  brandName: {
    color: colors.textPrimary,
    fontSize: '22px',
    fontWeight: 600,
    letterSpacing: '0.01em',
    lineHeight: 1.1,
    textWrap: 'balance',
  },
  brandTag: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    fontWeight: 500,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
  },
  progress: {
    alignItems: 'center',
    display: 'flex',
    gap: '10px',
    justifyContent: 'center',
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  progressStep: {
    alignItems: 'center',
    color: colors.textMuted,
    display: 'flex',
    fontSize: fontSizes.sm,
    gap: '8px',
  },
  progressStepDivider: {
    '::before': {
      backgroundColor: colors.border,
      content: '""',
      height: '1px',
      width: '28px',
    },
  },
  progressStepActive: {
    color: colors.textPrimary,
  },
  progressStepDone: {
    color: colors.textSecondary,
  },
  progressIndex: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radii.full,
    borderStyle: 'solid',
    borderWidth: '1px',
    display: 'inline-flex',
    fontSize: fontSizes.sm,
    height: '22px',
    justifyContent: 'center',
    width: '22px',
  },
  progressIndexActive: {
    borderColor: colors.accent,
    boxShadow: '0 0 0 3px rgb(255 176 0 / 0.12)',
    color: colors.accent,
  },
  progressIndexDone: {
    borderColor: colors.up,
    color: colors.up,
  },
});

function Brand() {
  const markSvgClassName = stylex.props(styles.brandMarkSvg).className;
  return (
    <header className={stylex.props(styles.brand).className}>
      <span
        className={stylex.props(styles.brandMark).className}
        dangerouslySetInnerHTML={{
          __html: KANSOKU_MARK_SVG.replace('<svg ', `<svg class="${markSvgClassName}" `),
        }}
      />
      <div className={stylex.props(styles.brandText).className}>
        <span className={stylex.props(styles.brandName).className}>Kansoku</span>
        <span className={stylex.props(styles.brandTag).className}>OBSERVED PATH</span>
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
    <ol className={stylex.props(styles.progress).className}>
      {steps.map((s, i) => {
        const isDone = i < activeIndex;
        const isActive = i === activeIndex;
        return (
          <li
            key={s.key}
            className={
              stylex.props(
                styles.progressStep,
                i > 0 && styles.progressStepDivider,
                isActive && styles.progressStepActive,
                isDone && styles.progressStepDone,
              ).className
            }
          >
            <span
              className={
                stylex.props(
                  styles.progressIndex,
                  isActive && styles.progressIndexActive,
                  isDone && styles.progressIndexDone,
                ).className
              }
            >
              {isDone ? '✓' : i + 1}
            </span>
            <span>{s.label}</span>
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
}: {
  step: OnboardingStep;
  status: CredentialsGetResult | null;
  onRecheck: () => void;
  onComplete: () => Promise<void>;
}) {
  const [localStep, setLocalStep] = useState<OnboardingStep>(step === 'longbridge' ? 'ai' : step);
  const renderStep = resolveRenderStep(step, localStep);
  const { pro, licensed } = useCapabilities();
  const offerPro = (pro && !licensed) || renderStep === 'pro';
  const steps = offerPro ? [...BASE_STEPS, PRO_STEP] : BASE_STEPS;

  return (
    <>
      <div className={stylex.props(styles.dragBar).className} aria-hidden="true">
        <div className="desktop-titlebar-traffic-spacer" />
      </div>
      <div className={`page ${stylex.props(styles.page).className}`}>
        <div className={stylex.props(styles.shell).className}>
          <Brand />
          <Progress step={renderStep} steps={steps} />
          {renderStep === 'longbridge' ? (
            <StepLongbridge status={status} onRecheck={onRecheck} />
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
