import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron-ipc-decorator', () => ({
  IpcMethod: () => (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
  IpcService: class {},
}));

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/agent-kit-ipc-smoke') },
  BrowserWindow: { getFocusedWindow: vi.fn(() => null) },
  dialog: { showOpenDialog: vi.fn() },
}));

const getDb = vi.hoisted(() => vi.fn(() => ({})));
vi.mock('@kansoku/core/db/index', () => ({ getDb }));

vi.mock('../../src/boot/env.js', () => ({
  dataRoot: '/tmp/agent-kit-ipc-smoke-dataroot',
  dataRootStatus: { mode: 'custom', effectivePath: '/tmp/agent-kit-ipc-smoke-dataroot', configuredPath: null, degraded: false },
}));

const store = vi.hoisted(() => ({
  read: vi.fn(() => ({ enabled: true, location: { kind: 'follow-data-root' as const }, lastSyncAt: undefined })),
  write: vi.fn(),
}));
vi.mock('../../src/agent-kit/store.js', () => ({ defaultAgentKitStore: () => store }));

const state = vi.hoisted(() => ({
  kitVersion: '1.0.0+20260722',
  appVersion: '1.0.0',
  syncedAt: '2026-07-22T00:00:00.000Z',
  templates: {},
}));
const readState = vi.hoisted(() => vi.fn(() => state));
const writeState = vi.hoisted(() => vi.fn());
vi.mock('../../src/agent-kit/state.js', () => ({ readState, writeState }));

const ensureAgentKit = vi.hoisted(() => vi.fn(async () => ({ conflicts: [], updates: [] })));
vi.mock('../../src/agent-kit/ensureAgentKit.js', () => ({ ensureAgentKit }));

const { AgentKitIpc } = await import('../../src/agent-kit/ipc.js');

beforeEach(() => {
  store.read.mockClear();
  store.write.mockClear();
  readState.mockClear();
  writeState.mockClear();
  ensureAgentKit.mockClear();
});

describe('agent-kit ipc', () => {
  it('registers under the agentKit group', () => {
    expect(AgentKitIpc.groupName).toBe('agentKit');
  });

  it('getStatus reports the store state plus data-root state', async () => {
    const instance = new AgentKitIpc();
    const result = await instance.getStatus();
    expect(result).toEqual({
      ok: true,
      data: {
        enabled: true,
        location: { kind: 'follow-data-root' },
        resolvedPath: '/tmp/agent-kit-ipc-smoke-dataroot',
        followBlocked: false,
        dataRoot: '/tmp/agent-kit-ipc-smoke-dataroot',
        lastSyncAt: undefined,
        kitVersion: '1.0.0+20260722',
        pendingConflicts: undefined,
        pendingUpdates: undefined,
      },
    });
  });

  it('forceSync runs ensureAgentKit and stamps lastSyncAt on the store', async () => {
    const instance = new AgentKitIpc();
    const result = await instance.forceSync();
    expect(ensureAgentKit).toHaveBeenCalledTimes(1);
    expect(store.write).toHaveBeenCalledWith(expect.objectContaining({ lastSyncAt: expect.any(String) }));
    expect(result).toEqual({ ok: true, data: { conflicts: [], updates: [] } });
  });

  it('clean removes the kit directory without touching user files', async () => {
    const instance = new AgentKitIpc();
    const result = await instance.clean();
    expect(result).toEqual({ ok: true, data: { cleaned: true } });
  });
});
