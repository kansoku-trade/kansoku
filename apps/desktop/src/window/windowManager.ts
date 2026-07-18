import { join } from "node:path";
import { app } from "electron";
import type { BrowserWindow } from "electron";
import { createWindow } from "./mainWindow.js";
import { registerWindowsIpc } from "./ipc.js";
import { createPopoutWindow } from "./popoutWindow.js";
import {
  addWindowEntry,
  createWindowsFileStore,
  nextWindowId,
  removeWindowEntry,
  updateActiveTab,
  type WindowsState,
} from "./store.js";

export interface WindowManagerOptions {
  userDataDir: string;
  onWindowFocus?: () => void;
  debounceMs?: number;
}

export interface WindowManager {
  openWindow(): BrowserWindow;
  restoreWindows(): void;
  windowCount(): number;
  flush(): Promise<void>;
}

export async function createWindowManager(options: WindowManagerOptions): Promise<WindowManager> {
  const fileStore = createWindowsFileStore(join(options.userDataDir, "windows.json"), options.debounceMs);
  let state: WindowsState = await fileStore.load();
  const registry = new Map<string, BrowserWindow>();
  let quitting = false;

  app.on("before-quit", () => {
    quitting = true;
  });

  function windowIdForSender(senderId: number): string | undefined {
    for (const [id, win] of registry) {
      if (win.webContents.id === senderId) return id;
    }
    return undefined;
  }

  registerWindowsIpc({
    getContext(senderId) {
      const windowId = windowIdForSender(senderId);
      if (!windowId) return undefined;
      const entry = state.find((item) => item.id === windowId);
      return { windowId, activeTabId: entry?.activeTabId ?? "" };
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

    win.on("closed", () => {
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

  return {
    openWindow(): BrowserWindow {
      return openWithActiveTab("");
    },

    restoreWindows(): void {
      if (state.length === 0) {
        spawn(nextWindowId([]), "");
        return;
      }
      for (const entry of state) {
        spawn(entry.id, entry.activeTabId);
      }
    },

    windowCount(): number {
      return registry.size;
    },

    async flush(): Promise<void> {
      await fileStore.flush();
    },
  };
}
