import { contextBridge, ipcRenderer } from "electron";
import { CREDENTIALS_CHANNELS } from "./credentialsChannels.js";

// Only the packaged app:// page gets the privileged IPC surface (MessagePort
// kernel bridge, credentials, external API controls). In dev (ELECTRON_DEV=1)
// the window loads the Vite dev server over http://, which runs against its
// own standalone kernel — exposing these there would route traffic (including
// secrets) to the embedded kernel instead, leaving two kernels with divergent
// state.
const isAppOrigin = location.protocol === "app:";

const desktopApi: Record<string, unknown> = {
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
  },
};

if (isAppOrigin) {
  contextBridge.exposeInMainWorld("__DESKTOP_RT__", true);

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data !== "desktop-rt-connect") return;
    const channel = new MessageChannel();
    ipcRenderer.postMessage("desktop-rt-connect", null, [channel.port2]);
    window.postMessage("desktop-rt-port", "*", [channel.port1]);
  });

  desktopApi.credentials = {
    get: () => ipcRenderer.invoke(CREDENTIALS_CHANNELS.get),
    set: (creds: unknown) => ipcRenderer.invoke(CREDENTIALS_CHANNELS.set, creds),
    clear: () => ipcRenderer.invoke(CREDENTIALS_CHANNELS.clear),
    test: (creds: unknown) => ipcRenderer.invoke(CREDENTIALS_CHANNELS.test, creds),
  };

  desktopApi.externalApi = {
    getState: () => ipcRenderer.invoke("desktop:external-api:get-state"),
    enable: () => ipcRenderer.invoke("desktop:external-api:enable"),
    disable: () => ipcRenderer.invoke("desktop:external-api:disable"),
    resetToken: () => ipcRenderer.invoke("desktop:external-api:reset-token"),
  };
}

contextBridge.exposeInMainWorld("desktop", desktopApi);
