import { afterEach, describe, expect, it } from 'vitest';
import { ApiError } from '../api';
import {
  getLicenseRequiredModeSnapshotForTests,
  resetLicenseRequiredModeForTests,
} from '../licenseRequiredMode';
import { getRestrictedModeSnapshotForTests, resetRestrictedModeForTests } from '../restrictedMode';
import { unwrapEnvelope } from './envelope';

describe('unwrapEnvelope', () => {
  afterEach(() => {
    resetRestrictedModeForTests();
    resetLicenseRequiredModeForTests();
  });

  it('returns data and meta for an ok envelope', () => {
    expect(unwrapEnvelope({ ok: true, data: { a: 1 }, meta: { b: 2 } }, 200)).toEqual({
      data: { a: 1 },
      meta: { b: 2 },
    });
  });

  it('returns data with undefined meta when the envelope has none', () => {
    expect(unwrapEnvelope({ ok: true, data: [1, 2] }, 200)).toEqual({
      data: [1, 2],
      meta: undefined,
    });
  });

  it('throws ApiError with the hint appended', () => {
    try {
      unwrapEnvelope({ ok: false, error: 'boom', hint: 'try again' }, 400);
      throw new Error('expected unwrapEnvelope to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).message).toBe('boom (try again)');
      expect((err as ApiError).status).toBe(400);
    }
  });

  it('marks restricted mode for a credentials 503', () => {
    expect(() =>
      unwrapEnvelope({ ok: false, error: 'not configured', code: 'NO_CREDENTIALS' }, 503),
    ).toThrow(ApiError);
    expect(getRestrictedModeSnapshotForTests().restricted).toBe(true);
  });

  it('does not mark restricted mode for an unrelated error', () => {
    expect(() => unwrapEnvelope({ ok: false, error: 'nope' }, 404)).toThrow(ApiError);
    expect(getRestrictedModeSnapshotForTests().restricted).toBe(false);
  });

  it('marks license-required mode for a 403 LICENSE_REQUIRED', () => {
    expect(() =>
      unwrapEnvelope(
        { ok: false, error: 'AI features require an active license', code: 'LICENSE_REQUIRED' },
        403,
      ),
    ).toThrow(ApiError);
    expect(getLicenseRequiredModeSnapshotForTests()).toBe(true);
  });

  it('does not mark license-required mode for an unrelated 403', () => {
    expect(() => unwrapEnvelope({ ok: false, error: 'forbidden' }, 403)).toThrow(ApiError);
    expect(getLicenseRequiredModeSnapshotForTests()).toBe(false);
  });
});
