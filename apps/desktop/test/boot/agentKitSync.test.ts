import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as Record<string, unknown>).__DESKTOP_DEV__ = false;

const electronApp = vi.hoisted(() => ({
  setName: vi.fn(),
  getPath: vi.fn(() => '/tmp/agent-kit-boot-smoke'),
  isPackaged: true,
}));
vi.mock('electron', () => ({ app: electronApp }));

const dataRootStatusRef = vi.hoisted(() => ({ mode: 'custom' as string }));
vi.mock('../../src/data/dataRoot/status.js', () => ({
  buildDataRootStatus: vi.fn(() => ({ mode: dataRootStatusRef.mode })),
}));
vi.mock('../../src/data/dataRoot/usability.js', () => ({ isDataRootUsable: vi.fn(() => false) }));
vi.mock('../../src/boot/paths.js', () => ({
  resolveDataRoot: vi.fn(() => '/tmp/agent-kit-boot-smoke-root'),
  scaffoldDataRoot: vi.fn(),
}));
vi.mock('../../src/boot/skills.js', () => ({
  bundledSkillsPath: vi.fn(() => '/tmp/agent-kit-boot-smoke-skills'),
  ensureBundledSkills: vi.fn(),
}));

const store = vi.hoisted(() => ({
  exists: vi.fn(() => true),
  read: vi.fn(() => ({ enabled: true, location: { kind: 'follow-data-root' as const } })),
  write: vi.fn(),
}));
vi.mock('../../src/agent-kit/store.js', () => ({ defaultAgentKitStore: () => store }));

const ensureAgentKit = vi.hoisted(() => vi.fn(async () => ({ conflicts: [], updates: [] })));
vi.mock('../../src/agent-kit/ensureAgentKit.js', () => ({ ensureAgentKit }));

const getDb = vi.hoisted(() => vi.fn(() => ({})));
vi.mock('@kansoku/core/db/index', () => ({ getDb }));

const originalPlatform = process.platform;

function setPlatform(platform: string): void {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
}

beforeEach(() => {
  electronApp.isPackaged = true;
  setPlatform('darwin');
  (process as unknown as { resourcesPath?: string }).resourcesPath = '/tmp/agent-kit-boot-smoke-resources';
  dataRootStatusRef.mode = 'custom';
  store.exists.mockReset().mockReturnValue(true);
  store.read.mockReset().mockReturnValue({ enabled: true, location: { kind: 'follow-data-root' } });
  store.write.mockClear();
  ensureAgentKit.mockClear();
  getDb.mockClear();
});

afterEach(() => {
  setPlatform(originalPlatform);
});

describe('boot/env agent-kit sync', () => {
  it('runs ensureAgentKit at boot when packaged, on darwin, and the store reports enabled', async () => {
    vi.resetModules();
    await import('../../src/boot/env.js');
    await vi.waitFor(() => expect(ensureAgentKit).toHaveBeenCalledTimes(1));
    expect(getDb).toHaveBeenCalledTimes(1);
  });

  it('skips ensureAgentKit when the store reports disabled', async () => {
    store.read.mockReturnValue({ enabled: false, location: { kind: 'follow-data-root' } });
    vi.resetModules();
    await import('../../src/boot/env.js');
    await new Promise((resolve) => setImmediate(resolve));
    expect(ensureAgentKit).not.toHaveBeenCalled();
  });

  it('skips ensureAgentKit when the app is not packaged (dev)', async () => {
    electronApp.isPackaged = false;
    vi.resetModules();
    await import('../../src/boot/env.js');
    await new Promise((resolve) => setImmediate(resolve));
    expect(ensureAgentKit).not.toHaveBeenCalled();
  });

  it('skips ensureAgentKit on non-darwin platforms', async () => {
    setPlatform('win32');
    vi.resetModules();
    await import('../../src/boot/env.js');
    await new Promise((resolve) => setImmediate(resolve));
    expect(ensureAgentKit).not.toHaveBeenCalled();
  });

  it('does not throw when ensureAgentKit rejects', async () => {
    ensureAgentKit.mockRejectedValueOnce(new Error('sync failed'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.resetModules();
    await expect(import('../../src/boot/env.js')).resolves.toBeDefined();
    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledWith('[agent-kit] boot sync failed', expect.any(Error)));
    errorSpy.mockRestore();
  });
});

describe('boot/env agent-kit first-run seeding', () => {
  it('seeds enabled and syncs when the store has no file yet and the data root is not the app default', async () => {
    store.exists.mockReturnValue(false);
    dataRootStatusRef.mode = 'custom';
    store.read.mockReturnValue({ enabled: true, location: { kind: 'follow-data-root' } });

    vi.resetModules();
    await import('../../src/boot/env.js');

    expect(store.write).toHaveBeenCalledWith({ enabled: true, location: { kind: 'follow-data-root' } });
    await vi.waitFor(() => expect(ensureAgentKit).toHaveBeenCalledTimes(1));
  });

  it('seeds disabled and skips sync when the store has no file yet and the data root is the app default', async () => {
    store.exists.mockReturnValue(false);
    dataRootStatusRef.mode = 'default';
    store.read.mockReturnValue({ enabled: false, location: { kind: 'follow-data-root' } });

    vi.resetModules();
    await import('../../src/boot/env.js');
    await new Promise((resolve) => setImmediate(resolve));

    expect(store.write).toHaveBeenCalledWith({ enabled: false, location: { kind: 'follow-data-root' } });
    expect(ensureAgentKit).not.toHaveBeenCalled();
  });
});
