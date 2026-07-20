import { beforeEach, describe, expect, it, vi } from 'vitest';

// This suite deliberately does NOT mock '../../../server/src/runtimeInit.js'
// or './kernel.js' internals — it exercises the real prepareServerRuntime /
// activateProComposition orchestration so a regression that re-introduces a
// second register+start pass is actually observable, not hidden behind a
// mocked-away seam.

vi.mock('@kansoku/core/env', () => ({
  CHART_DATA_DIR: '/tmp/chart-data',
  PROJECT_ROOT: '/tmp/kernel-single-activation-test-project-root',
}));

const getDb = vi.hoisted(() => vi.fn(() => ({})));
vi.mock('@kansoku/core/db/index', () => ({ getDb }));

const getAiRuntime = vi.hoisted(() => vi.fn(() => ({ secretBox: undefined })));
const initAiSettings = vi.hoisted(() => vi.fn());
vi.mock('@kansoku/core/ai/initAiSettings', () => ({ getAiRuntime, initAiSettings }));

const setProductionHost = vi.hoisted(() => vi.fn());
vi.mock('@kansoku/core/license/dodoEnv', () => ({ setProductionHost }));

const startLicenseRevalidation = vi.hoisted(() => vi.fn());
vi.mock('@kansoku/core/license/licenseSchedule', () => ({ startLicenseRevalidation }));

const initLicenseManager = vi.hoisted(() => vi.fn());
const getActiveBundleKey = vi.hoisted(() => vi.fn(() => undefined));
vi.mock('@kansoku/core/license/licenseState', () => ({ initLicenseManager, getActiveBundleKey }));

const createWatchedMarketsStore = vi.hoisted(() => vi.fn(() => ({})));
const setActiveWatchedMarketsStore = vi.hoisted(() => vi.fn());
vi.mock('@kansoku/core/services/watchedMarketsStore', () => ({
  createWatchedMarketsStore,
  setActiveWatchedMarketsStore,
}));

const initAuthUrlOpener = vi.hoisted(() => vi.fn());
vi.mock('@kansoku/core/services/credentials/authUrlOpener', () => ({ initAuthUrlOpener }));

const initCredentialProvider = vi.hoisted(() => vi.fn());
vi.mock('@kansoku/core/services/credentials/registry', () => ({ initCredentialProvider }));

const setProPresent = vi.hoisted(() => vi.fn());
const hasEncBundle = vi.hoisted(() => vi.fn(() => false));
const isProPresent = vi.hoisted(() => vi.fn(() => false));
vi.mock('@kansoku/core/pro/bundleState', () => ({ setProPresent, hasEncBundle, isProPresent }));

const registerProHooks = vi.hoisted(() => vi.fn());
vi.mock('@kansoku/core/pro/hooks', () => ({ registerProHooks }));

const registerProAiExtension = vi.hoisted(() => vi.fn());
vi.mock('@kansoku/core/pro/aiExtension', () => ({ registerProAiExtension }));

const registerProChannels = vi.hoisted(() => vi.fn());
vi.mock('@kansoku/core/pro/channels', () => ({ registerProChannels }));

const loadPro = vi.hoisted(() => vi.fn(async () => null));
vi.mock('@kansoku/core/pro/loader', () => ({ loadPro }));

const createKernel = vi.hoisted(() =>
  vi.fn(async () => ({
    app: {
      getInstance: () => ({ fetch: async () => new Response('ok', { status: 200 }) }),
    },
  })),
);
vi.mock('../../../server/src/bootstrap.js', () => ({ createKernel }));

const attachRealtimeBridge = vi.hoisted(() => vi.fn());
vi.mock('@desktop/kernel/realtime/bridge.js', () => ({ attachRealtimeBridge }));

const serverStart = vi.hoisted(() => vi.fn());
const serverDispose = vi.hoisted(() => vi.fn());
const serverModuleClass = vi.hoisted(() => class ServerAiModule {});
const serverLoadProComposition = vi.hoisted(() =>
  vi.fn(async () => ({
    modules: [serverModuleClass],
    hooks: {
      requestImmediateFollow: vi.fn(),
      startDeepDiveForNote: vi.fn(),
      deepDiveStatus: vi.fn(),
    },
    realtimeChannels: ['server-channel'],
    aiExtension: { prepareTurn: vi.fn(), tag: 'server' },
    start: serverStart,
    dispose: serverDispose,
  })),
);
vi.mock('../../../server/src/edition/pro.js', () => ({
  loadProComposition: serverLoadProComposition,
}));

const desktopStart = vi.hoisted(() => vi.fn());
const desktopDispose = vi.hoisted(() => vi.fn());
const desktopLoadProComposition = vi.hoisted(() =>
  vi.fn(async () => ({
    ipcServices: [],
    hooks: {
      requestImmediateFollow: vi.fn(),
      startDeepDiveForNote: vi.fn(),
      deepDiveStatus: vi.fn(),
    },
    realtimeChannels: ['desktop-channel'],
    aiExtension: { prepareTurn: vi.fn(), tag: 'desktop' },
    start: desktopStart,
    dispose: desktopDispose,
  })),
);
vi.mock('@desktop/edition/pro.js', () => ({ loadProComposition: desktopLoadProComposition }));

vi.mock('@desktop/boot/env.js', () => ({ IS_DEV: true }));

const registerCredentialsIpc = vi.hoisted(() => vi.fn());
const createCredentialsBridgeHandlers = vi.hoisted(() => vi.fn(() => ({})));
vi.mock('@desktop/data/credentials/bridge.js', () => ({
  registerCredentialsIpc,
  createCredentialsBridgeHandlers,
}));

vi.mock('@desktop/data/credentials/secretBox.js', () => ({
  createDesktopSecretBox: vi.fn(),
}));

const startProActivationWatch = vi.hoisted(() => vi.fn());
vi.mock('@desktop/boot/proActivationWatch.js', () => ({ startProActivationWatch }));

vi.mock('@desktop/boot/proRelaunch.js', () => ({ promptProRelaunch: vi.fn() }));

const electronApp = vi.hoisted(() => ({
  getPath: vi.fn(() => '/tmp/userData'),
  getAppPath: vi.fn(() => '/tmp/app'),
  isPackaged: false,
}));
vi.mock('electron', () => ({
  app: electronApp,
  ipcMain: { on: vi.fn(), handle: vi.fn() },
  safeStorage: {},
  shell: { openExternal: vi.fn(() => Promise.resolve()) },
}));

const { bootKernel } = await import('@desktop/boot/kernel.js');

describe('bootKernel pro composition activation (real seam, not mocked away)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mounts the server edition module list without activating its lifecycle, and activates the desktop edition exactly once', async () => {
    const result = await bootKernel();

    expect(createKernel).toHaveBeenCalledWith([serverModuleClass]);

    // Defect 2 regression guard: the server edition composition's own
    // start/dispose must never run on desktop.
    expect(serverStart).not.toHaveBeenCalled();
    expect(serverDispose).not.toHaveBeenCalled();

    // The desktop edition composition must be the one and only composition
    // registered into the core pro seams and started.
    expect(desktopStart).toHaveBeenCalledTimes(1);
    expect(setProPresent).toHaveBeenCalledTimes(1);
    expect(setProPresent).toHaveBeenCalledWith(true);
    expect(registerProHooks).toHaveBeenCalledTimes(1);
    expect(registerProAiExtension).toHaveBeenCalledTimes(1);
    expect(registerProAiExtension).toHaveBeenCalledWith(expect.objectContaining({ tag: 'desktop' }));
    expect(registerProChannels).toHaveBeenCalledTimes(1);
    expect(registerProChannels).toHaveBeenCalledWith(['desktop-channel']);

    await result.dispose();
    expect(desktopDispose).toHaveBeenCalledTimes(1);
    expect(serverDispose).not.toHaveBeenCalled();
  });
});
