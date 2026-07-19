import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TabsFileStore, TabsState } from '@desktop/shell/tabs/store.js';
import { emptyTabsState, openTab } from '@desktop/shell/tabs/store.js';

type Handler = (event: unknown, payload?: unknown) => unknown;

const handlers = new Map<string, Handler>();
const ipcMain = {
  handle: vi.fn((channel: string, handler: Handler) => {
    handlers.set(channel, handler);
  }),
};

class FakeWindow {
  webContents = { send: vi.fn() };
}

let windows: FakeWindow[] = [];
const BrowserWindow = {
  getAllWindows: vi.fn(() => windows),
};

vi.mock('electron', () => ({ ipcMain, BrowserWindow }));

const TABS_GET_CHANNEL = 'tabs.getSnapshot';
const TABS_MUTATE_CHANNEL = 'tabs.mutate';
const TABS_SNAPSHOT_CHANNEL = 'desktop:tabs:snapshot';

// electron-ipc-decorator's IpcHandler singleton dedupes channel registration,
// so each test resets modules to re-register against a fresh service instance.
async function registerTabsIpc(fileStore: TabsFileStore): Promise<void> {
  vi.resetModules();
  const { TabsIpc } = await import('@desktop/shell/tabs/ipc.js');
  const { createTabsService } = await import('@desktop/shell/tabs/service.js');
  new TabsIpc(createTabsService(fileStore));
}

function fakeFileStore(initial: TabsState): TabsFileStore & { saved: TabsState[] } {
  const saved: TabsState[] = [];
  return {
    saved,
    load: vi.fn(async () => initial),
    scheduleSave: vi.fn((state: TabsState) => {
      saved.push(state);
    }),
    flushSync: vi.fn(() => {}),
  };
}

describe('TabsIpc', () => {
  beforeEach(() => {
    handlers.clear();
    windows = [new FakeWindow(), new FakeWindow()];
    ipcMain.handle.mockClear();
    BrowserWindow.getAllWindows.mockClear();
  });

  it('returns the loaded snapshot on get', async () => {
    const seeded = openTab(emptyTabsState(), '/symbol/NVDA.US');
    await registerTabsIpc(fakeFileStore(seeded));

    const result = await handlers.get(TABS_GET_CHANNEL)?.({});
    expect(result).toEqual(seeded);
  });

  it('returns an empty snapshot when nothing was persisted', async () => {
    await registerTabsIpc(fakeFileStore(emptyTabsState()));

    const result = await handlers.get(TABS_GET_CHANNEL)?.({});
    expect(result).toEqual({ revision: 0, tabs: [] });
  });

  it('adopts legacy tabs onto an empty store via mutate', async () => {
    const fileStore = fakeFileStore(emptyTabsState());
    await registerTabsIpc(fileStore);

    const legacyTabs = [{ id: 'a', route: '/symbol/NVDA.US', title: 'NVDA', scrollY: 10 }];
    const result = (await handlers.get(TABS_MUTATE_CHANNEL)?.(
      {},
      {
        op: 'adopt',
        tabs: legacyTabs,
      },
    )) as TabsState;

    expect(result.tabs).toEqual(legacyTabs);
    expect(result.revision).toBe(1);
    expect(fileStore.scheduleSave).toHaveBeenCalledWith(result);
    for (const win of windows) {
      expect(win.webContents.send).toHaveBeenCalledWith(TABS_SNAPSHOT_CHANNEL, result);
    }
  });

  it('applies a mutation, persists it, and broadcasts to every window', async () => {
    const initial = openTab(emptyTabsState(), '/');
    const fileStore = fakeFileStore(initial);
    await registerTabsIpc(fileStore);

    const result = (await handlers.get(TABS_MUTATE_CHANNEL)?.(
      {},
      {
        op: 'open',
        route: '/symbol/NVDA.US',
      },
    )) as TabsState;

    expect(result.tabs).toHaveLength(2);
    expect(fileStore.scheduleSave).toHaveBeenCalledWith(result);
    for (const win of windows) {
      expect(win.webContents.send).toHaveBeenCalledWith(TABS_SNAPSHOT_CHANNEL, result);
    }
  });

  it('keeps the state intact for an unrecognized op and does not broadcast', async () => {
    const initial = openTab(emptyTabsState(), '/');
    const fileStore = fakeFileStore(initial);
    await registerTabsIpc(fileStore);

    const result = await handlers.get(TABS_MUTATE_CHANNEL)?.({}, { op: 'explode', id: 'x' });

    expect(result).toEqual(initial);
    expect(fileStore.scheduleSave).not.toHaveBeenCalled();
    for (const win of windows) {
      expect(win.webContents.send).not.toHaveBeenCalled();
    }

    const after = await handlers.get(TABS_GET_CHANNEL)?.({});
    expect(after).toEqual(initial);
  });

  it('does not persist or broadcast a no-op mutation', async () => {
    const initial = openTab(emptyTabsState(), '/');
    const fileStore = fakeFileStore(initial);
    await registerTabsIpc(fileStore);

    const result = await handlers.get(TABS_MUTATE_CHANNEL)?.({}, { op: 'close', id: 'missing' });

    expect(result).toEqual(initial);
    expect(fileStore.scheduleSave).not.toHaveBeenCalled();
    for (const win of windows) {
      expect(win.webContents.send).not.toHaveBeenCalled();
    }
  });
});
