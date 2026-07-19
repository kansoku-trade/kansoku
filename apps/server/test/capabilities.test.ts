import type { ProModule } from '@kansoku/pro-api';
import { afterEach, describe, expect, it } from 'vitest';
import {
  setLicenseManagerForTests,
  type LicenseManager,
} from '@kansoku/core/license/licenseState';
import { loadPro } from '@kansoku/core/pro/loader';
import {
  freeHooks,
  registerProModule,
  setEncBundlePresent,
  unregisterProModuleForTests,
} from '@kansoku/core/pro/registry';
import { tsukiRequest } from './helpers.js';

function fakeProModule(overrides: Partial<ProModule> = {}): ProModule {
  return { hooks: freeHooks, ...overrides };
}

function fakeLicenseManager(overrides: Partial<LicenseManager> = {}): LicenseManager {
  return {
    getLicenseSnapshot: () => ({ state: 'unlicensed' }),
    getBundleKey: () => undefined,
    activate: async () => ({ activated: true }),
    deactivate: async () => ({}) as never,
    revalidate: async () => {},
    ...overrides,
  };
}

function allFeatures(state: 'absent' | 'locked' | 'active') {
  return { 'symbol-follow': state, 'deep-dive': state, 'research-ai': state };
}

describe('GET /capabilities', () => {
  afterEach(async () => {
    setLicenseManagerForTests(null);
    await loadPro();
  });

  it('reports pro:false licensed:false when pro is absent', async () => {
    unregisterProModuleForTests();
    setLicenseManagerForTests(fakeLicenseManager());
    const res = await tsukiRequest('/api/capabilities');
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({
      pro: false,
      licensed: false,
      license: { state: 'unlicensed' },
      features: allFeatures('absent'),
      hasEncBundle: false,
    });
  });

  it('reports locked features and hasEncBundle:true when the enc bundle is present but not loaded', async () => {
    unregisterProModuleForTests();
    setEncBundlePresent(true);
    setLicenseManagerForTests(fakeLicenseManager());
    const res = await tsukiRequest('/api/capabilities');
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({
      pro: false,
      licensed: false,
      license: { state: 'unlicensed' },
      features: allFeatures('locked'),
      hasEncBundle: true,
    });
  });

  it('reports pro:true licensed:false with an unlicensed snapshot', async () => {
    registerProModule(fakeProModule());
    setLicenseManagerForTests(
      fakeLicenseManager({ getLicenseSnapshot: () => ({ state: 'unlicensed' }) }),
    );
    const res = await tsukiRequest('/api/capabilities');
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({
      pro: true,
      licensed: false,
      license: { state: 'unlicensed' },
      features: allFeatures('locked'),
      hasEncBundle: false,
    });
  });

  it('reports pro:true licensed:true with a licensed snapshot', async () => {
    registerProModule(fakeProModule());
    setLicenseManagerForTests(
      fakeLicenseManager({
        getLicenseSnapshot: () => ({
          state: 'licensed',
          deviceName: 'my-mac',
          maskedKey: '••••7890',
        }),
      }),
    );
    const res = await tsukiRequest('/api/capabilities');
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({
      pro: true,
      licensed: true,
      license: { state: 'licensed', deviceName: 'my-mac', maskedKey: '••••7890' },
      features: allFeatures('active'),
      hasEncBundle: false,
    });
  });

  it('keeps the license status route working when pro is absent (does not 404)', async () => {
    unregisterProModuleForTests();
    setLicenseManagerForTests(fakeLicenseManager());
    const res = await tsukiRequest('/api/license/status');
    expect(res.status).toBe(200);
  });
});
