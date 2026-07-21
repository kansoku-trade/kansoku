import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  setLicenseManagerForTests,
  type LicenseManager,
} from '../src/license/licenseState.js';
import { setEncBundlePresent, setProPresent } from '../src/pro/bundleState.js';
import {
  currentProHooks,
  freeHooks,
  registerProHooks,
  resetProHooksForTests,
} from '../src/pro/hooks.js';
import { symbolsService } from '../src/symbols/symbols.service.js';

function fakeLicenseManager(): LicenseManager {
  return {
    getLicenseSnapshot: () => ({ state: 'licensed' }),
    getBundleKey: () => undefined,
    getBundleKeyId: () => undefined,
    activate: async () => ({ activated: true }),
    deactivate: async () => ({}) as never,
    revalidate: async () => {},
  };
}

afterEach(() => {
  resetProHooksForTests();
  setProPresent(false);
  setEncBundlePresent(false);
  setLicenseManagerForTests(null);
});

describe('symbolsService routes through the registered pro hooks', () => {
  it('defaults to the free no-op hooks, and the license gate keeps them from ever running unlicensed', async () => {
    expect(currentProHooks()).toBe(freeHooks);
    expect(currentProHooks().startDeepDiveForNote('NVDA')).toEqual({
      started: false,
      reason: 'disabled',
    });
    expect(currentProHooks().deepDiveStatus()).toEqual({ running: false });
    expect(() => currentProHooks().requestImmediateFollow('NVDA.US')).not.toThrow();

    const err = await symbolsService.deepDive({ sym: 'NVDA.US' }).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 404 });
  });

  it('reaches the composition-registered hooks when pro is active and licensed', async () => {
    setProPresent(true);
    setLicenseManagerForTests(fakeLicenseManager());

    const startDeepDiveForNote = vi.fn(() => ({ started: true }) as const);
    const deepDiveStatus = vi.fn(() => ({ running: true, symbol: 'NVDA.US' }));
    const requestImmediateFollow = vi.fn();
    registerProHooks({
      ...freeHooks,
      requestImmediateFollow,
      startDeepDiveForNote,
      deepDiveStatus,
    });

    const deepDiveResult = await symbolsService.deepDive({ sym: 'NVDA.US' });
    expect(startDeepDiveForNote).toHaveBeenCalledWith('NVDA');
    expect(deepDiveResult).toEqual({ started: true });

    const statusResult = await symbolsService.deepDiveStatus({ sym: 'NVDA.US' });
    expect(deepDiveStatus).toHaveBeenCalledTimes(1);
    expect(statusResult).toEqual({ running: true, symbol: 'NVDA.US' });

    const sym = 'ZPROHOOKSTEST.US';
    try {
      await symbolsService.stopFollow({ sym });
      await symbolsService.startFollow({ sym });
      expect(requestImmediateFollow).toHaveBeenCalledWith(sym);
    } finally {
      await symbolsService.stopFollow({ sym });
    }
  });
});
