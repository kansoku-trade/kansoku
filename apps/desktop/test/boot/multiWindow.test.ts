import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({
  app: {
    getAppPath: vi.fn(() => '/app'),
    isPackaged: false,
    getPath: vi.fn(() => '/tmp'),
  },
  ipcMain: { on: vi.fn(), handle: vi.fn() },
  safeStorage: {},
  shell: { openExternal: vi.fn() },
}));
vi.mock('electron', () => electron);

vi.mock('electron-ipc-decorator', () => ({
  IpcMethod: () => (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
  IpcService: class {},
}));

vi.mock('../../src/boot/env.js', () => ({ IS_DEV: true }));

vi.mock('../../src/credentials/bridge.js', () => ({
  createCredentialsBridgeHandlers: vi.fn(() => ({})),
  registerCredentialsIpc: vi.fn(),
}));

const loadEdition = vi.hoisted(() => vi.fn());
vi.mock('@kansoku/core/pro/editionLoader', () => ({ loadEdition }));

const initServerRuntime = vi.hoisted(() => vi.fn());
vi.mock('../../../server/src/runtimeInit.js', () => ({ initServerRuntime }));

const attachRealtimeBridge = vi.hoisted(() => vi.fn());
vi.mock('../../src/realtime/bridge.js', () => ({ attachRealtimeBridge }));

const createKernel = vi.hoisted(() => vi.fn());
vi.mock('../../../server/src/bootstrap.js', () => ({ createKernel }));

const getActiveBundleKey = vi.hoisted(() => vi.fn((): string | null => null));
vi.mock('@kansoku/core/license/licenseState', () => ({ getActiveBundleKey }));

vi.stubGlobal('__DESKTOP_DEV__', false);

const { bootKernel } = await import('../../src/boot/kernel.js');
const { unregisterProModuleForTests } = await import('@kansoku/core/pro/registry');

function fakeCoreHost() {
  return {
    db: {},
    license: { isLicensed: () => true },
    aiSettings: {},
    watchedMarkets: {},
    paths: { kansokuHome: '/tmp/kansoku-home' },
    production: false,
    logger: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
  };
}

function fakeServerEdition() {
  return { initialize: vi.fn(async () => {}), start: vi.fn(async () => {}), dispose: vi.fn(async () => {}) };
}

beforeEach(() => {
  initServerRuntime.mockReset();
  attachRealtimeBridge.mockReset();
  createKernel.mockReset();
  loadEdition.mockReset();
  getActiveBundleKey.mockReset().mockReturnValue(null);

  createKernel.mockImplementation(async () => ({
    app: { getInstance: () => ({ fetch: vi.fn(async () => new Response('ok', { status: 200 })) }) },
  }));
  loadEdition.mockResolvedValue({ state: 'absent', bundlePresent: false });
  initServerRuntime.mockImplementation(async () => ({
    host: fakeCoreHost(),
    edition: fakeServerEdition(),
    protocol: 'edition',
  }));
});

afterEach(() => {
  unregisterProModuleForTests();
  vi.restoreAllMocks();
});

describe('bootKernel called more than once per process (no reset of underlying mocks)', () => {
  it('resolves cleanly both times, and each call gets its own ipc registry contents', async () => {
    const first = await bootKernel();
    const second = await bootKernel();

    expect(first.ipcServiceClasses).toEqual(second.ipcServiceClasses);
    expect(attachRealtimeBridge).toHaveBeenCalledTimes(2);
    expect(loadEdition).toHaveBeenCalledTimes(2);

    await expect(first.dispose()).resolves.toBeUndefined();
    await expect(second.dispose()).resolves.toBeUndefined();
  });
});

describe('kernel.ts module graph', () => {
  it('never imports the window manager (multi-window creation stays out of boot)', () => {
    const kernelSourcePath = fileURLToPath(new URL('../../src/boot/kernel.ts', import.meta.url));
    const source = readFileSync(kernelSourcePath, 'utf8');
    expect(source).not.toMatch(/windowManager|createWindowManager/);
  });
});
