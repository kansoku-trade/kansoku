import { BrowserWindow, ipcMain } from "electron";
import { dataRootStatus } from "../boot/env.js";
import { runResetDataRootFlow, runSelectDataRootFlow } from "./flow.js";
import { getDataRootRestartPending } from "./restartState.js";

export function registerDataRootIpc(): void {
  ipcMain.handle("desktop:data-root:get", () => ({
    ...dataRootStatus,
    restartPending: getDataRootRestartPending(),
  }));

  ipcMain.handle("desktop:data-root:pick", () =>
    runSelectDataRootFlow(BrowserWindow.getFocusedWindow()),
  );

  ipcMain.handle("desktop:data-root:reset", () =>
    runResetDataRootFlow(BrowserWindow.getFocusedWindow()),
  );
}

export { getDataRootRestartPending };
