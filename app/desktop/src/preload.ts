import { contextBridge, ipcRenderer } from "electron";
import { CREDENTIALS_CHANNELS } from "./credentials/channels.js";
import { IPC_GROUPS } from "./ipc/groups.js";
import { TABS_COMMAND_CHANNEL, type TabsCommand } from "./tabs/channels.js";

// main.ts boots one embedded kernel regardless of dev or packaged mode, so
// both the packaged app:// page and the dev renderer (ELECTRON_DEV=1, served
// from the Vite dev server at DEV_WEB_URL) talk to that same kernel over this
// same privileged IPC surface (MessagePort kernel bridge, rpc, credentials,
// external API controls) — there is no longer a second, divergent kernel to
// guard against.
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

  desktopApi.externalApi = {
    getState: () => ipcRenderer.invoke("desktop:external-api:get-state"),
    enable: () => ipcRenderer.invoke("desktop:external-api:enable"),
    disable: () => ipcRenderer.invoke("desktop:external-api:disable"),
    resetToken: () => ipcRenderer.invoke("desktop:external-api:reset-token"),
  };

  desktopApi.tabs = {
    onCommand: (cb: (command: TabsCommand) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, command: TabsCommand) => cb(command);
      ipcRenderer.on(TABS_COMMAND_CHANNEL, listener);
      return () => ipcRenderer.removeListener(TABS_COMMAND_CHANNEL, listener);
    },
  };
}

contextBridge.exposeInMainWorld("desktop", desktopApi);
