import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import { createWindow } from './mainWindow.js';
import { WindowsIpc } from './ipc.js';
import { createPopoutWindow } from './popoutWindow.js';
import { createTrainerWindow } from './trainerWindow.js';
import {
  addWindowEntry,
  createWindowsFileStore,
  nextWindowId,
  removeWindowEntry,
  updateActiveTab,
  type WindowsState,
} from './store.js';

export interface WindowManagerOptions {
  userDataDir: string;
  onWindowFocus?: () => void;
  debounceMs?: number;
}

export interface WindowManager {
  openWindow(): BrowserWindow;
  restoreWindows(): void;
  handleActivate(): void;
  windowCount(): number;
  flushSync(): void;
  getPrimaryWindow(): BrowserWindow | null;
}

export async function createWindowManager(options: WindowManagerOptions): Promise<WindowManager> {
  const fileStore = createWindowsFileStore(
    join(options.userDataDir, 'windows.json'),
    options.debounceMs,
  );
  let state: WindowsState = await fileStore.load();
  const registry = new Map<string, BrowserWindow>();
  let quitting = false;

  app.on('before-quit', () => {
    quitting = true;
  });

  function windowIdForSender(senderId: number): string | undefined {
    for (const [id, win] of registry) {
      if (win.webContents.id === senderId) return id;
    }
    return undefined;
  }

  new WindowsIpc({
    getContext(senderId) {
      const windowId = windowIdForSender(senderId);
      if (!windowId) return undefined;
      const entry = state.find((item) => item.id === windowId);
      return { windowId, activeTabId: entry?.activeTabId ?? '' };
    },
    reportActiveTab(senderId, activeTabId) {
      const windowId = windowIdForSender(senderId);
      if (!windowId) return;
      const next = updateActiveTab(state, windowId, activeTabId);
      if (next === state) return;
      state = next;
      fileStore.scheduleSave(state);
    },
    openPopout(symbol) {
      createPopoutWindow(symbol);
    },
    openWindow(activeTabId) {
      openWithActiveTab(activeTabId);
    },
    openTrainer() {
      createTrainerWindow();
    },
  });

  function spawn(windowId: string, activeTabId: string): BrowserWindow {
    const withEntry = addWindowEntry(state, windowId, activeTabId);
    if (withEntry !== state) {
      state = withEntry;
      fileStore.scheduleSave(state);
    }

    const win = createWindow({
      stateFileName: `window-state-${windowId}.json`,
      onFocus: options.onWindowFocus,
    });
    registry.set(windowId, win);

    win.on('closed', () => {
      registry.delete(windowId);
      if (quitting) return;
      const withoutEntry = removeWindowEntry(state, windowId);
      if (withoutEntry === state) return;
      state = withoutEntry;
      fileStore.scheduleSave(state);
    });

    return win;
  }

  function openWithActiveTab(activeTabId: string): BrowserWindow {
    const id = nextWindowId(state.map((entry) => entry.id));
    return spawn(id, activeTabId);
  }

  function restoreWindows(): void {
    if (state.length === 0) {
      spawn(nextWindowId([]), '');
      return;
    }
    for (const entry of state) {
      spawn(entry.id, entry.activeTabId);
    }
  }

  return {
    openWindow(): BrowserWindow {
      return openWithActiveTab('');
    },

    restoreWindows,

    handleActivate(): void {
      // Trainer/popout windows live outside the registry — count every app
      // window so a Dock click focuses them instead of respawning main windows.
      if (BrowserWindow.getAllWindows().length > 0) return;
      restoreWindows();
    },

    windowCount(): number {
      return registry.size;
    },

    flushSync(): void {
      fileStore.flushSync();
    },

    getPrimaryWindow(): BrowserWindow | null {
      return registry.values().next().value ?? null;
    },
  };
}
