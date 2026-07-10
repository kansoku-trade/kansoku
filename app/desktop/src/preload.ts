import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("desktop", {
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
  },
});
