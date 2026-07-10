import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktop", {
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
  },
});

// Only the packaged app:// page gets the MessagePort kernel bridge. In dev
// (ELECTRON_DEV=1) the window loads the Vite dev server over http://, which
// runs against its own standalone kernel — exposing __DESKTOP_RT__ there
// would route realtime traffic to the embedded kernel instead, leaving two
// kernels with divergent state. Falling back to a plain WebSocket in dev
// keeps client and realtime pointed at the same server.
if (location.protocol === "app:") {
  contextBridge.exposeInMainWorld("__DESKTOP_RT__", true);

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data !== "desktop-rt-connect") return;
    const channel = new MessageChannel();
    ipcRenderer.postMessage("desktop-rt-connect", null, [channel.port2]);
    window.postMessage("desktop-rt-port", "*", [channel.port1]);
  });
}
