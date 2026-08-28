import { beforeEach, describe, expect, it, vi } from 'vitest';

// The point of this suite is the wiring, so runtimeInit itself is NOT mocked: it
// runs for real against doubled leaf seams, and the only thing asserted is that
// the shared host runtime is what starts the event collector.

vi.mock('@kansoku/core/platform/env', () => ({
  CHART_DATA_DIR: '/tmp/chart-data',
  PROJECT_ROOT: '/tmp/events-collector-wiring-test',
}));

const getDb = vi.hoisted(() => vi.fn(() => ({})));
vi.mock('@kansoku/core/db/index', () => ({ getDb }));

const startEventCollector = vi.hoisted(() => vi.fn(async () => null));
const stopEventCollector = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@kansoku/core/events/collector', () => ({ startEventCollector, stopEventCollector }));

vi.mock('@kansoku/core/ai/settings/initAiSettings', () => ({
  getAiRuntime: vi.fn(() => ({ secretBox: undefined })),
  initAiSettings: vi.fn(),
}));
vi.mock('@kansoku/core/license/dodoEnv', () => ({ setProductionHost: vi.fn() }));
vi.mock('@kansoku/core/license/licenseSchedule', () => ({ startLicenseRevalidation: vi.fn() }));
vi.mock('@kansoku/core/license/licenseState', () => ({ initLicenseManager: vi.fn() }));
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
vi.mock('@kansoku/core/pro/bundleState', () => ({ setProPresent: vi.fn() }));
vi.mock('@kansoku/core/pro/hooks', () => ({ registerProHooks: vi.fn() }));
vi.mock('@kansoku/core/pro/aiExtension', () => ({ registerProAiExtension: vi.fn() }));
vi.mock('@kansoku/core/pro/channels', () => ({ registerProChannels: vi.fn() }));
vi.mock('@kansoku/core/pro/detectors', () => ({ registerProDetectors: vi.fn() }));
vi.mock('@server/dotenv.js', () => ({ loadDotenv: vi.fn() }));

const { initServerHostRuntime } = await import('@server/runtimeInit.js');

describe('event collector wiring on the shared host runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts the collector exactly once as part of host init', async () => {
    await initServerHostRuntime();

    expect(startEventCollector).toHaveBeenCalledTimes(1);
  });

  it('still finishes host init when the collector refuses to start', async () => {
    startEventCollector.mockRejectedValueOnce(new Error('collector exploded'));

    // A background chore that cannot start must not take the app down with it —
    // charts, realtime and the journal do not depend on it.
    await expect(initServerHostRuntime()).resolves.toBeUndefined();
  });
});
