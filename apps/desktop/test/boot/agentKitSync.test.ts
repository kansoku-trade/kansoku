import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as Record<string, unknown>).__DESKTOP_DEV__ = false;

const electronApp = vi.hoisted(() => ({
  setName: vi.fn(),
  getPath: vi.fn(() => '/tmp/agent-kit-boot-smoke'),
  isPackaged: true,
}));
vi.mock('electron', () => ({ app: electronApp }));

vi.mock('../../src/boot/paths.js', () => ({
  resolveDesktopStoragePaths: vi.fn(() => ({
    workspaceRoot: '/tmp/agent-kit-boot-smoke-root',
    stateRoot: '/tmp/agent-kit-boot-smoke-state',
    databasePath: '/tmp/agent-kit-boot-smoke-state/app.db',
  })),
  scaffoldDataRoot: vi.fn(),
}));
vi.mock('../../src/boot/skills.js', () => ({
  bundledSkillsPath: vi.fn(() => '/tmp/agent-kit-boot-smoke-skills'),
  removeLegacyBundledSkillsLink: vi.fn(),
}));
const migrateLegacyStorage = vi.hoisted(() =>
  vi.fn(async (input: { beforeComplete?: () => Promise<void> }) => {
    await input.beforeComplete?.();
    return null;
  }),
);
vi.mock('../../src/storage/migration.js', () => ({
  initializeEmptyWorkspace: vi.fn(async () => {}),
  migrateLegacyStorage,
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
  delete process.env.TRADE_PROJECT_ROOT;
  electronApp.isPackaged = true;
  setPlatform('darwin');
  (process as unknown as { resourcesPath?: string }).resourcesPath =
    '/tmp/agent-kit-boot-smoke-resources';
  store.exists.mockReset().mockReturnValue(true);
  store.read.mockReset().mockReturnValue({ enabled: true, location: { kind: 'follow-data-root' } });
  store.write.mockClear();
  ensureAgentKit.mockReset().mockResolvedValue({ conflicts: [], updates: [] });
  getDb.mockClear();
  migrateLegacyStorage.mockClear();
});

afterEach(() => {
  setPlatform(originalPlatform);
});

describe('boot/env agent-kit sync', () => {
  it('runs ensureAgentKit at boot when packaged, on darwin, and the store reports enabled', async () => {
    vi.resetModules();
    const env = await import('../../src/boot/env.js');
    await env.prepareDesktopStorage({ skipMigration: true });
    expect(ensureAgentKit).toHaveBeenCalledTimes(1);
    expect(getDb).toHaveBeenCalledTimes(1);
  });

  it('skips ensureAgentKit when the store reports disabled', async () => {
    store.read.mockReturnValue({ enabled: false, location: { kind: 'follow-data-root' } });
    vi.resetModules();
    const env = await import('../../src/boot/env.js');
    await env.prepareDesktopStorage({ skipMigration: true });
    expect(ensureAgentKit).not.toHaveBeenCalled();
  });

  it('skips ensureAgentKit when the app is not packaged (dev)', async () => {
    electronApp.isPackaged = false;
    vi.resetModules();
    const env = await import('../../src/boot/env.js');
    await env.prepareDesktopStorage();
    expect(ensureAgentKit).not.toHaveBeenCalled();
  });

  it('skips ensureAgentKit on non-darwin platforms', async () => {
    setPlatform('win32');
    vi.resetModules();
    const env = await import('../../src/boot/env.js');
    await env.prepareDesktopStorage({ skipMigration: true });
    expect(ensureAgentKit).not.toHaveBeenCalled();
  });

  it('does not throw when ensureAgentKit rejects', async () => {
    ensureAgentKit.mockRejectedValueOnce(new Error('sync failed'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.resetModules();
    const env = await import('../../src/boot/env.js');
    await expect(env.prepareDesktopStorage({ skipMigration: true })).resolves.toBeNull();
    expect(errorSpy).toHaveBeenCalledWith('[agent-kit] boot sync failed', expect.any(Error));
    errorSpy.mockRestore();
  });

  it('blocks a migrating startup when the required Agent Kit sync fails', async () => {
    ensureAgentKit.mockRejectedValueOnce(new Error('sync failed'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.resetModules();
    const env = await import('../../src/boot/env.js');

    await expect(env.prepareDesktopStorage()).rejects.toThrow('sync failed');
    expect(migrateLegacyStorage).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});

describe('boot/env agent-kit first-run seeding', () => {
  it('seeds enabled and syncs the fixed Workspace on a new install', async () => {
    store.exists.mockReturnValue(false);
    store.read.mockReturnValue({ enabled: true, location: { kind: 'follow-data-root' } });

    vi.resetModules();
    const env = await import('../../src/boot/env.js');
    await env.prepareDesktopStorage({ skipMigration: true });

    expect(store.write).toHaveBeenCalledWith({
      enabled: true,
      location: { kind: 'follow-data-root' },
    });
    expect(ensureAgentKit).toHaveBeenCalledTimes(1);
  });
});
