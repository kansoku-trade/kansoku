import { afterEach, describe, expect, it } from 'vitest';
import { FEATURES, type FeatureTier } from '@kansoku/pro-api/features';
import {
  setLicenseManagerForTests,
  type LicenseManager,
} from '../src/license/licenseState.js';
import { setEncBundlePresent, setProPresent } from '../src/pro/bundleState.js';
import { capabilitiesService } from '../src/capabilities/capabilities.service.js';

const featureKeys = Object.keys(FEATURES) as Array<keyof typeof FEATURES>;

function fakeLicenseManager(licensed: boolean): LicenseManager {
  return {
    getLicenseSnapshot: () => ({ state: licensed ? 'licensed' : 'unlicensed' }),
    getBundleKey: () => undefined,
    getBundleKeyId: () => undefined,
    activate: async () => ({ activated: true }),
    deactivate: async () => ({}) as never,
    revalidate: async () => {},
  };
}

afterEach(() => {
  setProPresent(false);
  setEncBundlePresent(false);
  setLicenseManagerForTests(null);
});

describe('capabilitiesService.get', () => {
  it('marks every pro-tier key absent when no pro module is present', async () => {
    const result = await capabilitiesService.get();
    expect(result.pro).toBe(false);
    expect(result.licensed).toBe(false);
    expect(result.hasEncBundle).toBe(false);
    for (const key of featureKeys) {
      expect(result.features).toHaveProperty(key);
      const tier = FEATURES[key].tier as FeatureTier;
      expect(result.features[key]).toBe(tier === 'free' ? 'active' : 'absent');
    }
  });

  it('marks pro-tier keys locked and reports hasEncBundle when only the enc bundle is present', async () => {
    setEncBundlePresent(true);
    const result = await capabilitiesService.get();
    expect(result.pro).toBe(false);
    expect(result.licensed).toBe(false);
    expect(result.hasEncBundle).toBe(true);
    for (const key of featureKeys) {
      const tier = FEATURES[key].tier as FeatureTier;
      expect(result.features[key]).toBe(tier === 'free' ? 'active' : 'locked');
    }
  });

  it('marks pro-tier keys locked when pro is registered but unlicensed', async () => {
    setProPresent(true);
    setLicenseManagerForTests(fakeLicenseManager(false));
    const result = await capabilitiesService.get();
    expect(result.pro).toBe(true);
    expect(result.licensed).toBe(false);
    for (const key of featureKeys) {
      const tier = FEATURES[key].tier as FeatureTier;
      expect(result.features[key]).toBe(tier === 'free' ? 'active' : 'locked');
    }
  });

  it('marks pro-tier keys active when pro is registered and licensed', async () => {
    setProPresent(true);
    setLicenseManagerForTests(fakeLicenseManager(true));
    const result = await capabilitiesService.get();
    expect(result.pro).toBe(true);
    expect(result.licensed).toBe(true);
    for (const key of featureKeys) {
      expect(result.features[key]).toBe('active');
    }
  });
});
