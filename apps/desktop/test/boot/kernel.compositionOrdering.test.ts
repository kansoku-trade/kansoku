import { beforeEach, describe, expect, it, vi } from 'vitest';

// This suite deliberately does NOT mock '../../../server/src/runtimeInit.js'
// — it exercises the real initServerHostRuntime / resolveServerProComposition
// orchestration bootKernel drives, so a regression that reintroduces the
// server composition import ahead of loadPro is actually observable.
//
// Only the two leaf seams are doubled: loadPro (from @kansoku/core/pro/loader)
// and the server edition's loadProComposition (from
// ../../../server/src/edition/pro.js). The double for loadProComposition
// throws the exact "Cannot find module .../__pro__/..." error a packaged
// build produces when it runs before loadPro has registered the pro chunks
// as virtual modules — mirroring loadPro's real precondition without needing
// a real encrypted bundle. See packages/core/test/pro-encLoader.test.ts for
// the corresponding fully-real (native ESM, unmocked) proof that a virtual
// module import fails before registerVirtualModules and succeeds after.

vi.mock('@kansoku/core/env', () => ({
  CHART_DATA_DIR: '/tmp/chart-data',
  PROJECT_ROOT: '/tmp/kernel-composition-ordering-test-project-root',
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

// The bundle-key precondition loadPro enforces in production, modelled
// without a real encrypted blob: flips true only once loadPro has "run".
const virtualModulesRegistered = vi.hoisted(() => ({ value: false }));

const loadPro = vi.hoisted(() =>
  vi.fn(async () => {
    virtualModulesRegistered.value = true;
    return null as { webFiles: Map<string, Buffer> } | null;
  }),
);
vi.mock('@kansoku/core/pro/loader', () => ({ loadPro }));

const serverModuleClass = vi.hoisted(() => class ServerAiModule {});
const serverLoadProComposition = vi.hoisted(() =>
  vi.fn(async () => {
    if (!virtualModulesRegistered.value) {
      // The exact class of failure a packaged build produces: the pro node
      // chunk only exists as a virtual module once loadPro has registered
      // it, so importing the composition point before that throws this.
      throw new Error(
        "Cannot find module '/Kansoku.app/Contents/Resources/app.asar/dist-main/__pro__/pro.pro-Cy8SHFKN.mjs'",
      );
    }
    return {
      modules: [serverModuleClass],
      realtimeChannels: [],
      start: vi.fn(),
      dispose: vi.fn(),
    };
  }),
);
vi.mock('../../../server/src/edition/pro.js', () => ({
  loadProComposition: serverLoadProComposition,
}));

const desktopLoadProComposition = vi.hoisted(() => vi.fn(async () => null));
vi.mock('@desktop/edition/pro.js', () => ({ loadProComposition: desktopLoadProComposition }));

vi.mock('@desktop/boot/env.js', () => ({ IS_DEV: true }));

const createKernel = vi.hoisted(() =>
  vi.fn(async () => ({
    app: { getInstance: () => ({ fetch: async () => new Response('ok', { status: 200 }) }) },
  })),
);
vi.mock('../../../server/src/bootstrap.js', () => ({ createKernel }));

const attachRealtimeBridge = vi.hoisted(() => vi.fn());
vi.mock('@desktop/kernel/realtime/bridge.js', () => ({ attachRealtimeBridge }));

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
  isPackaged: true,
}));
vi.mock('electron', () => ({
  app: electronApp,
  ipcMain: { on: vi.fn(), handle: vi.fn() },
  safeStorage: {},
  shell: { openExternal: vi.fn(() => Promise.resolve()) },
}));

const { bootKernel } = await import('@desktop/boot/kernel.js');

describe('bootKernel server composition ordering (real orchestration, not mocked away)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    virtualModulesRegistered.value = false;
  });

  it('resolves a non-empty server module list into createKernel because loadPro runs before the composition import', async () => {
    await bootKernel();

    expect(loadPro).toHaveBeenCalled();
    expect(serverLoadProComposition).toHaveBeenCalled();
    expect(createKernel).toHaveBeenCalledWith([serverModuleClass]);
  });
});
