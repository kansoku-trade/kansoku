import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktop", {
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
  },
});

contextBridge.exposeInMainWorld("__DESKTOP_RT__", true);

window.addEventListener("message", (event) => {
  if (event.source !== window || event.data !== "desktop-rt-connect") return;
  const channel = new MessageChannel();
  ipcRenderer.postMessage("desktop-rt-connect", null, [channel.port2]);
  window.postMessage("desktop-rt-port", "*", [channel.port1]);
});
