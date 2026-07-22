import { describe, expect, it } from 'vitest';
import { computeGateStatus, computeStatusLoading } from './gateStatus';

const base = {
  hasDesktopBridge: true,
  statusLoading: false,
  configured: true,
  onboardingCompleted: true,
  longbridgeSkipped: false,
};

describe('computeGateStatus', () => {
  it('is ready immediately in a plain browser (no desktop bridge), regardless of everything else', () => {
    expect(
      computeGateStatus({
        ...base,
        hasDesktopBridge: false,
        statusLoading: true,
        configured: false,
        onboardingCompleted: false,
      }),
    ).toEqual({ status: 'ready', step: null });
  });

  it('is loading while the desktop status request is in flight', () => {
    expect(
      computeGateStatus({
        ...base,
        statusLoading: true,
        configured: null,
        onboardingCompleted: null,
      }),
    ).toEqual({
      status: 'loading',
      step: null,
    });
  });

  it('onboards at the longbridge step when the CLI is not ready and skip was never used', () => {
    expect(computeGateStatus({ ...base, configured: false, onboardingCompleted: true })).toEqual({
      status: 'onboarding',
      step: 'longbridge',
    });
  });

  it('fails open to ready when the credentials request itself failed (configured unknown)', () => {
    expect(computeGateStatus({ ...base, configured: null })).toEqual({
      status: 'ready',
      step: null,
    });
  });

  it('onboards at the ai step when longbridge is ready but onboarding was never completed', () => {
    expect(computeGateStatus({ ...base, configured: true, onboardingCompleted: false })).toEqual({
      status: 'onboarding',
      step: 'ai',
    });
  });

  it('is ready once longbridge is ready and onboarding is completed', () => {
    expect(computeGateStatus({ ...base, configured: true, onboardingCompleted: true })).toEqual({
      status: 'ready',
      step: null,
    });
  });

  it('fails open to ready when the onboarding flag is unknown (bridge missing / read failed)', () => {
    expect(computeGateStatus({ ...base, configured: true, onboardingCompleted: null })).toEqual({
      status: 'ready',
      step: null,
    });
  });

  it('never returns the twitter step — the gate has no per-step knowledge of it', () => {
    const cases = [
      { ...base, hasDesktopBridge: false },
      { ...base, statusLoading: true, configured: null, onboardingCompleted: null },
      { ...base, configured: false },
      { ...base, configured: null },
      { ...base, configured: true, onboardingCompleted: false },
      { ...base, configured: true, onboardingCompleted: true },
      { ...base, configured: true, onboardingCompleted: null },
    ];
    for (const params of cases) expect(computeGateStatus(params).step).not.toBe('twitter');
  });

  describe('longbridgeSkipped (third track)', () => {
    it('unskipped + unconfigured still onboards at the longbridge step (existing behavior)', () => {
      expect(
        computeGateStatus({ ...base, configured: false, longbridgeSkipped: false }),
      ).toEqual({ status: 'onboarding', step: 'longbridge' });
    });

    it('skipped + unconfigured falls through to the ai step when onboarding is not completed', () => {
      expect(
        computeGateStatus({
          ...base,
          configured: false,
          longbridgeSkipped: true,
          onboardingCompleted: false,
        }),
      ).toEqual({ status: 'onboarding', step: 'ai' });
    });

    it('skipped + unconfigured is ready once onboarding is completed', () => {
      expect(
        computeGateStatus({
          ...base,
          configured: false,
          longbridgeSkipped: true,
          onboardingCompleted: true,
        }),
      ).toEqual({ status: 'ready', step: null });
    });

    it('skipped + configured is identical to the unskipped configured behavior', () => {
      expect(
        computeGateStatus({
          ...base,
          configured: true,
          longbridgeSkipped: true,
          onboardingCompleted: false,
        }),
      ).toEqual({ status: 'onboarding', step: 'ai' });
      expect(
        computeGateStatus({
          ...base,
          configured: true,
          longbridgeSkipped: true,
          onboardingCompleted: true,
        }),
      ).toEqual({ status: 'ready', step: null });
    });

    it('skipped + null-configured still fails open to ready (fail-open preserved)', () => {
      expect(
        computeGateStatus({ ...base, configured: null, longbridgeSkipped: true }),
      ).toEqual({ status: 'ready', step: null });
    });

    it('an unknown skip flag (null) does not skip the longbridge step (fail-closed for the skip itself)', () => {
      expect(
        computeGateStatus({ ...base, configured: false, longbridgeSkipped: null }),
      ).toEqual({ status: 'onboarding', step: 'longbridge' });
    });

    it('a later dropped CLI login does not re-trap a skipped user (skip stays persisted)', () => {
      expect(
        computeGateStatus({
          ...base,
          configured: false,
          longbridgeSkipped: true,
          onboardingCompleted: true,
        }),
      ).toEqual({ status: 'ready', step: null });
    });
  });
});

describe('computeStatusLoading', () => {
  it('is loading while the credentials request is in flight, regardless of anything else', () => {
    expect(
      computeStatusLoading({ credentialsLoading: true, configured: null, onboardingLoading: false }),
    ).toBe(true);
  });

  it('does not wait on the onboarding state when configured could not be determined', () => {
    expect(
      computeStatusLoading({ credentialsLoading: false, configured: null, onboardingLoading: true }),
    ).toBe(false);
  });

  it('waits on the onboarding state once unconfigured is known (the skip flag lives there)', () => {
    expect(
      computeStatusLoading({ credentialsLoading: false, configured: false, onboardingLoading: true }),
    ).toBe(true);
  });

  it('waits on the onboarding state once configured is known true (the ai flag lives there)', () => {
    expect(
      computeStatusLoading({ credentialsLoading: false, configured: true, onboardingLoading: true }),
    ).toBe(true);
  });

  it('is not loading once both requests have resolved', () => {
    expect(
      computeStatusLoading({ credentialsLoading: false, configured: false, onboardingLoading: false }),
    ).toBe(false);
  });
});
