import { beforeEach, describe, expect, it, vi } from 'vitest';

// Deliberately does NOT mock '../../../server/src/runtimeInit.js': the desktop
// host must get the event collector from the same shared host runtime the server
// uses, and mocking that seam away would hide a host that quietly runs without it.

vi.mock('@kansoku/core/platform/env', () => ({
  CHART_DATA_DIR: '/tmp/chart-data',
  PROJECT_ROOT: '/tmp/kernel-event-collector-test',
}));

vi.mock('@kansoku/core/db/index', () => ({ getDb: vi.fn(() => ({})) }));

const startEventCollector = vi.hoisted(() => vi.fn(async () => null));
const stopEventCollector = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@kansoku/core/events/collector', () => ({ startEventCollector, stopEventCollector }));

vi.mock('@kansoku/core/ai/settings/initAiSettings', () => ({
  getAiRuntime: vi.fn(() => ({ secretBox: undefined })),
  initAiSettings: vi.fn(),
}));
vi.mock('@kansoku/core/license/dodoEnv', () => ({ setProductionHost: vi.fn() }));
vi.mock('@kansoku/core/license/licenseSchedule', () => ({ startLicenseRevalidation: vi.fn() }));
vi.mock('@kansoku/core/license/licenseState', () => ({
  getActiveBundleKey: vi.fn(() => undefined),
  initLicenseManager: vi.fn(),
}));
vi.mock('@kansoku/core/marketdata/watchedMarketsStore', () => ({
  createWatchedMarketsStore: vi.fn(() => ({})),
  setActiveWatchedMarketsStore: vi.fn(),
}));
vi.mock('@kansoku/core/marketdata/longbridgeRegionStore', () => ({
  createLongbridgeRegionStore: vi.fn(() => ({})),
  setActiveLongbridgeRegionStore: vi.fn(),
}));
vi.mock('@kansoku/core/credentials/authUrlOpener', () => ({ initAuthUrlOpener: vi.fn() }));
vi.mock('@kansoku/core/credentials/registry', () => ({ initCredentialProvider: vi.fn() }));
vi.mock('@kansoku/core/pro/bundleState', () => ({
  hasEncBundle: vi.fn(() => false),
  isProPresent: vi.fn(() => false),
  setProPresent: vi.fn(),
}));
vi.mock('@kansoku/core/pro/hooks', () => ({ registerProHooks: vi.fn() }));
vi.mock('@kansoku/core/pro/aiMemory', () => ({ registerProAiMemory: vi.fn() }));
vi.mock('@kansoku/core/pro/channels', () => ({ registerProChannels: vi.fn() }));
vi.mock('@kansoku/core/pro/detectors', () => ({ registerProDetectors: vi.fn() }));
vi.mock('@kansoku/core/pro/loader', () => ({ loadPro: vi.fn(async () => null) }));

const disposeMarketData = vi.hoisted(() => vi.fn());
vi.mock('@kansoku/core/marketdata/registry', () => ({ disposeMarketData }));

vi.mock('../../../server/src/dotenv.js', () => ({ loadDotenv: vi.fn() }));

vi.mock('../../../server/src/bootstrap.js', () => ({
  createKernel: vi.fn(async () => ({
    app: { getInstance: () => ({ fetch: async () => new Response('ok', { status: 200 }) }) },
  })),
}));

vi.mock('../../../server/src/edition/pro.js', () => ({
  loadProComposition: vi.fn(async () => null),
}));
vi.mock('@desktop/edition/pro.js', () => ({ loadProComposition: vi.fn(async () => null) }));
vi.mock('@desktop/kernel/realtime/bridge.js', () => ({ attachRealtimeBridge: vi.fn() }));
vi.mock('@desktop/boot/env.js', () => ({ IS_DEV: true }));
vi.mock('@desktop/data/credentials/bridge.js', () => ({
  createCredentialsBridgeHandlers: vi.fn(() => ({})),
  registerCredentialsIpc: vi.fn(),
}));
vi.mock('@desktop/data/credentials/secretBox.js', () => ({ createDesktopSecretBox: vi.fn() }));
vi.mock('@desktop/boot/proActivationWatch.js', () => ({ startProActivationWatch: vi.fn() }));
vi.mock('@desktop/boot/proRelaunch.js', () => ({ promptProRelaunch: vi.fn() }));

vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn(() => '/tmp/app'),
    getPath: vi.fn(() => '/tmp/userData'),
    isPackaged: false,
  },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  safeStorage: {},
  shell: { openExternal: vi.fn(() => Promise.resolve()) },
}));

const { bootKernel } = await import('@desktop/boot/kernel.js');

describe('desktop host and the market event collector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts the collector through the shared host runtime and stops it on dispose', async () => {
    const result = await bootKernel();

    expect(startEventCollector).toHaveBeenCalledTimes(1);
    expect(stopEventCollector).not.toHaveBeenCalled();

    await result.dispose();

    expect(stopEventCollector).toHaveBeenCalledTimes(1);
    expect(disposeMarketData).toHaveBeenCalledTimes(1);
  });

  it('does not stop the collector twice when dispose is called twice', async () => {
    const result = await bootKernel();

    await result.dispose();
    await result.dispose();

    expect(stopEventCollector).toHaveBeenCalledTimes(1);
  });
});
