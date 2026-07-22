import { afterEach, describe, expect, it } from 'vitest';
import { FEATURES, type FeatureTier } from '@kansoku/pro-api/features';
import {
  setLicenseManagerForTests,
  type LicenseManager,
} from '../src/license/licenseState.js';
import { setEncBundlePresent, setProPresent } from '../src/pro/bundleState.js';
import { setActiveWatchedMarketsStore } from '../src/marketdata/watchedMarketsStore.js';
import { setDefaultProviderName } from '../src/marketdata/registry.js';
import { capabilitiesService } from '../src/capabilities/capabilities.service.js';

const featureKeys = Object.keys(FEATURES) as Array<keyof typeof FEATURES>;

function fakeLicenseManager(licensed: boolean): LicenseManager {
  return {
    getLicenseSnapshot: () => ({ state: licensed ? 'licensed' : 'unlicensed' }),
    getBundleKey: () => undefined,
    activate: async () => ({ activated: true }),
    deactivate: async () => ({}) as never,
    revalidate: async () => {},
  };
}

afterEach(() => {
  setProPresent(false);
  setEncBundlePresent(false);
  setLicenseManagerForTests(null);
  setActiveWatchedMarketsStore(null);
  setDefaultProviderName('longbridge');
  delete process.env.MARKET_PROVIDER_HK;
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

  it('reports the longbridge datasource for the default watched market', async () => {
    const result = await capabilitiesService.get();
    expect(result.datasources).toEqual([{ market: 'US', name: 'longbridge', realtime: true }]);
  });

  it('reports a non-realtime datasource when the default provider is yahoo', async () => {
    setDefaultProviderName('yahoo');
    const result = await capabilitiesService.get();
    expect(result.datasources).toEqual([{ market: 'US', name: 'yahoo', realtime: false }]);
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

  it('returns datasources for healthy markets when one provider fails', async () => {
    process.env.MARKET_PROVIDER_HK = 'bogus-provider';
    setActiveWatchedMarketsStore({
      get: () => ['US', 'HK'],
      set: () => {},
      revision: () => 0,
    });

    const result = await capabilitiesService.get();

    expect(result.datasources).toEqual([{ market: 'US', name: 'longbridge', realtime: true }]);
  });
});
