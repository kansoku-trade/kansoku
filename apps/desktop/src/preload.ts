import { contextBridge, ipcRenderer } from "electron";
import { CONTEXT_MENU_CHANNELS } from "./contextMenu/channels.js";
import { CREDENTIALS_CHANNELS } from "./credentials/channels.js";
import { IPC_GROUPS } from "./ipc/groups.js";
import { TABS_COMMAND_CHANNEL, TABS_GET_CHANNEL, TABS_MUTATE_CHANNEL, TABS_SNAPSHOT_CHANNEL, type TabsCommand } from "./tabs/channels.js";
import type { MutateOp, TabsState } from "./tabs/store.js";
import { UPDATER_CHANNELS } from "./updater/channels.js";
import {
  WINDOWS_ACTIVE_TAB_CHANNEL,
  WINDOWS_CONTEXT_CHANNEL,
  WINDOWS_OPEN_CHANNEL,
  WINDOWS_POPOUT_CHANNEL,
} from "./window/channels.js";
import type { WindowsContext } from "./window/ipc.js";

// main.ts boots one embedded kernel regardless of dev or packaged mode, so
// both the packaged app:// page and the dev renderer (ELECTRON_DEV=1, served
// from the Vite dev server at DEV_WEB_URL) talk to that same kernel over this
// same privileged IPC surface (MessagePort kernel bridge, rpc, credentials)
// — there is no longer a second, divergent kernel to guard against.
const isPrivilegedOrigin =
  location.protocol === "app:" ||
  (process.env.ELECTRON_DEV === "1" && location.origin === "http://localhost:5199");

const desktopApi: Record<string, unknown> = {
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
  },
};

function isAllowedIpcChannel(channel: string): boolean {
  return IPC_GROUPS.some((group) => channel.startsWith(`${group}.`));
}

if (isPrivilegedOrigin) {
  contextBridge.exposeInMainWorld("__DESKTOP_RT__", true);

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data !== "desktop-rt-connect") return;
    const channel = new MessageChannel();
    ipcRenderer.postMessage("desktop-rt-connect", null, [channel.port2]);
    window.postMessage("desktop-rt-port", "*", [channel.port1]);
  });

  desktopApi.rpc = {
    async invoke(channel: string, ...args: unknown[]) {
      if (!isAllowedIpcChannel(channel)) {
        throw new Error(`ipc channel not allowed: ${channel}`);
      }
      return ipcRenderer.invoke(channel, ...args);
    },
  };

  desktopApi.credentials = {
    get: () => ipcRenderer.invoke(CREDENTIALS_CHANNELS.get),
  };

  desktopApi.onboarding = {
    getState: () => ipcRenderer.invoke("desktop:onboarding:get-state"),
    complete: () => ipcRenderer.invoke("desktop:onboarding:complete"),
  };

  desktopApi.tabs = {
    onCommand: (cb: (command: TabsCommand) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, command: TabsCommand) => cb(command);
      ipcRenderer.on(TABS_COMMAND_CHANNEL, listener);
      return () => ipcRenderer.removeListener(TABS_COMMAND_CHANNEL, listener);
    },
    getSnapshot: (): Promise<TabsState> => ipcRenderer.invoke(TABS_GET_CHANNEL),
    mutate: (op: MutateOp): Promise<TabsState> => ipcRenderer.invoke(TABS_MUTATE_CHANNEL, op),
    onSnapshot: (cb: (snapshot: TabsState) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, snapshot: TabsState) => cb(snapshot);
      ipcRenderer.on(TABS_SNAPSHOT_CHANNEL, listener);
      return () => ipcRenderer.removeListener(TABS_SNAPSHOT_CHANNEL, listener);
    },
  };

  desktopApi.windows = {
    getContext: (): Promise<WindowsContext | undefined> => ipcRenderer.invoke(WINDOWS_CONTEXT_CHANNEL),
    reportActiveTab: (activeTabId: string): void => {
      ipcRenderer.send(WINDOWS_ACTIVE_TAB_CHANNEL, activeTabId);
    },
    openPopout: (symbol: string): Promise<void> => ipcRenderer.invoke(WINDOWS_POPOUT_CHANNEL, symbol),
    openWindow: (activeTabId?: string): Promise<void> => ipcRenderer.invoke(WINDOWS_OPEN_CHANNEL, activeTabId ?? ""),
  };

  desktopApi.dataRoot = {
    get: () => ipcRenderer.invoke("desktop:data-root:get"),
    pick: () => ipcRenderer.invoke("desktop:data-root:pick"),
    reset: () => ipcRenderer.invoke("desktop:data-root:reset"),
  };

  desktopApi.logs = {
    getInfo: () => ipcRenderer.invoke("desktop:logs:get-info"),
    tail: (opts?: { maxBytes?: number }) => ipcRenderer.invoke("desktop:logs:tail", opts),
    reveal: () => ipcRenderer.invoke("desktop:logs:reveal"),
    openDir: () => ipcRenderer.invoke("desktop:logs:open-dir"),
  };

  desktopApi.contextMenu = {
    popup: (request: unknown) => ipcRenderer.invoke(CONTEXT_MENU_CHANNELS.popup, request),
  };

  desktopApi.updater = {
    getStatus: () => ipcRenderer.invoke(UPDATER_CHANNELS.getStatus),
    onStatus: (cb: (status: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, status: unknown) => cb(status);
      ipcRenderer.on(UPDATER_CHANNELS.status, listener);
      return () => ipcRenderer.removeListener(UPDATER_CHANNELS.status, listener);
    },
    installNow: () => ipcRenderer.invoke(UPDATER_CHANNELS.installNow),
  };
}

contextBridge.exposeInMainWorld("desktop", desktopApi);
