import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetProChannelsForTests } from '@kansoku/core/pro/channels';
import { resetProHooksForTests } from '@kansoku/core/pro/hooks';
import { setProPresent } from '@kansoku/core/pro/bundleState';
import { setAiRuntimeForTests } from '@kansoku/core/ai/settings/initAiSettings';
import { setModelsRuntimeForTests } from '@kansoku/core/ai/runtime/modelsRuntime';
import {
  setLicenseManagerForTests,
  type LicenseManager,
} from '@kansoku/core/license/licenseState';
import type { ServerProComposition } from '../src/edition/types.js';
import { tsukiRequest } from './helpers.js';

const startDeepDiveForNote = vi.hoisted(() => vi.fn(() => ({ started: true as const })));
const deepDiveStatus = vi.hoisted(() => vi.fn(() => ({ running: true })));
const requestImmediateFollow = vi.hoisted(() => vi.fn());
const disposeSpy = vi.hoisted(() => vi.fn());
const startSpy = vi.hoisted(() => vi.fn());

const loadProComposition = vi.hoisted(() =>
  vi.fn<() => Promise<ServerProComposition | null>>(async () => ({
    modules: [],
    realtimeChannels: [],
    hooks: {
      requestImmediateFollow,
      startDeepDiveForNote,
      deepDiveStatus,
    },
    start: startSpy,
    dispose: disposeSpy,
  })),
);
vi.mock('../src/edition/pro.js', () => ({ loadProComposition }));

const { initServerRuntime } = await import('../src/runtimeInit.js');

function fakeLicenseManager(overrides: Partial<LicenseManager> = {}): LicenseManager {
  return {
    getLicenseSnapshot: () => ({ state: 'licensed', deviceName: 'test', maskedKey: '••••1234' }),
    getBundleKey: () => undefined,
    getBundleKeyId: () => undefined,
    activate: async () => ({ activated: true }),
    deactivate: async () => ({}) as never,
    revalidate: async () => {},
    ...overrides,
  };
}

describe('server host pro-present wiring', () => {
  afterEach(() => {
    setProPresent(false);
    resetProHooksForTests();
    resetProChannelsForTests();
    setLicenseManagerForTests(null);
    setAiRuntimeForTests(null);
    setModelsRuntimeForTests(null);
    vi.clearAllMocks();
  });

  it('reports pro:true via /api/capabilities once a pro composition resolves', async () => {
    await initServerRuntime();
    setLicenseManagerForTests(fakeLicenseManager());

    const res = await tsukiRequest('/api/capabilities');
    expect(res.status).toBe(200);
    expect((await res.json()).data.pro).toBe(true);
  });

  it('does not 404 the pro-gated deep-dive route once pro is wired', async () => {
    await initServerRuntime();
    setLicenseManagerForTests(fakeLicenseManager());

    const res = await tsukiRequest('/api/symbols/MU/deep-dive', { method: 'POST' });
    expect(res.status).not.toBe(404);
  });

  it('routes deep-dive through the hooks the composition actually supplied', async () => {
    await initServerRuntime();
    setLicenseManagerForTests(fakeLicenseManager());

    const res = await tsukiRequest('/api/symbols/MU/deep-dive', { method: 'POST' });
    expect(res.status).toBe(202);
    expect(startDeepDiveForNote).toHaveBeenCalledWith('MU');

    const statusRes = await tsukiRequest('/api/symbols/MU/deep-dive/status');
    expect(statusRes.status).toBe(200);
    expect(deepDiveStatus).toHaveBeenCalled();
  });
});
