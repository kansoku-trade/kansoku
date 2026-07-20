import { afterEach, describe, expect, it } from 'vitest';
import {
  isBundleKeyEnvAllowed,
  isDevUnlicensedOverride,
  isLicensed,
  isLicenseBypassActive,
  setDevUnlicensedOverride,
} from '../src/license/licenseGate.js';

describe('isLicenseBypassActive', () => {
  it('is false when the env var is unset', () => {
    expect(isLicenseBypassActive({}, null)).toBe(false);
  });

  it('is false when the env var is set to anything other than "1"', () => {
    expect(isLicenseBypassActive({ KANSOKU_LICENSE_BYPASS: 'true' }, null)).toBe(false);
    expect(isLicenseBypassActive({ KANSOKU_LICENSE_BYPASS: '0' }, null)).toBe(false);
  });

  it('is dead in a packaged Electron build even with the env var set to 1', () => {
    expect(isLicenseBypassActive({ KANSOKU_LICENSE_BYPASS: '1' }, true)).toBe(false);
  });

  it('is active in a non-packaged Electron build (dev) with the env var set', () => {
    expect(isLicenseBypassActive({ KANSOKU_LICENSE_BYPASS: '1' }, false)).toBe(true);
  });

  it('falls back to NODE_ENV outside Electron (isPackaged unknown/null): blocked in production', () => {
    expect(
      isLicenseBypassActive({ KANSOKU_LICENSE_BYPASS: '1', NODE_ENV: 'production' }, null),
    ).toBe(false);
  });

  it('falls back to NODE_ENV outside Electron: allowed in dev/test', () => {
    expect(isLicenseBypassActive({ KANSOKU_LICENSE_BYPASS: '1', NODE_ENV: 'test' }, null)).toBe(
      true,
    );
    expect(isLicenseBypassActive({ KANSOKU_LICENSE_BYPASS: '1' }, null)).toBe(true);
  });
});

describe('setDevUnlicensedOverride', () => {
  afterEach(() => {
    setDevUnlicensedOverride(false);
  });

  it('forces isLicensed to false even when the bypass env is active', () => {
    process.env.KANSOKU_LICENSE_BYPASS = '1';
    try {
      expect(isLicensed()).toBe(true);
      setDevUnlicensedOverride(true);
      expect(isDevUnlicensedOverride()).toBe(true);
      expect(isLicensed()).toBe(false);
      setDevUnlicensedOverride(false);
      expect(isLicensed()).toBe(true);
    } finally {
      delete process.env.KANSOKU_LICENSE_BYPASS;
    }
  });
});

describe('isBundleKeyEnvAllowed', () => {
  it('is dead in a packaged Electron build even with the key set', () => {
    expect(isBundleKeyEnvAllowed({ KANSOKU_BUNDLE_KEY: 'ab' }, true)).toBe(false);
  });

  it('is allowed in a non-packaged Electron build (dev)', () => {
    expect(isBundleKeyEnvAllowed({ KANSOKU_BUNDLE_KEY: 'ab' }, false)).toBe(true);
  });

  it('falls back to NODE_ENV outside Electron (isPackaged unknown/null): blocked in production', () => {
    expect(isBundleKeyEnvAllowed({ NODE_ENV: 'production' }, null)).toBe(false);
  });

  it('falls back to NODE_ENV outside Electron: allowed in dev/test', () => {
    expect(isBundleKeyEnvAllowed({ NODE_ENV: 'test' }, null)).toBe(true);
    expect(isBundleKeyEnvAllowed({}, null)).toBe(true);
  });
});
