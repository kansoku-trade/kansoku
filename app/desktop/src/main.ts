// boot/env.js must stay the FIRST import in this file: its module body sets
// TRADE_PROJECT_ROOT (and app.setName) before anything else runs, and ESM
// import evaluation order is declaration order — every import below this one
// transitively reaches packages/core's env.ts, whose top-level consts read
// TRADE_PROJECT_ROOT once at module-load time. Reordering this import (or
// inserting one above it that reaches core) silently reintroduces a bug
// where env.ts captures an empty/wrong project root in the bundled output.
import "./boot/env.js";
import { existsSync } from "node:fs";
import { app, BrowserWindow } from "electron";
import { createServices } from "electron-ipc-decorator";
import { createAppMenuManager } from "./menu/appMenuManager.js";
import { bootKernel } from "./boot/kernel.js";
import { createWindow } from "./window/mainWindow.js";
import { showFatalErrorWindow } from "./window/fatalErrorWindow.js";
import { applyDevDockIcon } from "./window/dockIcon.js";
import { registerAppProtocolHandler, registerAppScheme, resolveWebDistRoot } from "./protocol/protocol.js";
import { createOnboardingStore } from "./onboarding/store.js";
import { registerOnboardingIpc } from "./onboarding/ipc.js";
import { runImportFromRepoFlow } from "./dataImport/flow.js";
import { runSelectDataRootFlow } from "./dataRoot/flow.js";
import { registerDataRootIpc } from "./dataRoot/ipc.js";
import {
  createFileLogger,
  installConsoleBridge,
  resolveMainLogPath,
} from "./logging/fileLogger.js";
import { installDefaultContextMenu } from "./contextMenu/defaultMenu.js";
import { registerContextMenuIpc } from "./contextMenu/ipc.js";
import { registerLogsIpc } from "./logging/ipc.js";
import { sendTabsCommand } from "./tabs/commands.js";
import { initUpdater } from "./updater/updater.js";
import { registerUpdaterIpc } from "./updater/ipc.js";

const fileLogger = createFileLogger({
  logFilePath: resolveMainLogPath(app.getPath("logs")),
});
installConsoleBridge(fileLogger);
console.log(`[desktop] logging to ${fileLogger.path}`);

// Scheme registration must run before app.ready — calling it at module top
// level (evaluated on import, ahead of the whenReady() handler below) makes
// that ordering impossible to get wrong regardless of what else this file
// grows into.
registerAppScheme();

function installAppMenu(checkForUpdates: () => void): void {
  createAppMenuManager({
    appName: app.name,
    deps: {
      importFromRepo: () => {
        runImportFromRepoFlow(BrowserWindow.getFocusedWindow()).catch((error: unknown) => {
          console.error("[desktop] import-from-repo flow crashed", error);
        });
      },
      selectDataRoot: () => {
        runSelectDataRootFlow(BrowserWindow.getFocusedWindow()).catch((error: unknown) => {
          console.error("[desktop] select-data-root flow crashed", error);
        });
      },
      openSettings: () => sendTabsCommand("open-settings"),
      openLogs: () => sendTabsCommand("open-logs"),
      checkForUpdates,
      newTab: () => sendTabsCommand("new-tab"),
      closeTab: () => sendTabsCommand("close-tab"),
      nextTab: () => sendTabsCommand("next-tab"),
      prevTab: () => sendTabsCommand("prev-tab"),
    },
  }).install();
}

app.whenReady().then(async () => {
  try {
    applyDevDockIcon();
    await bootKernel();
    const { ipcServiceClasses } = await import("./ipc/index.js");
    createServices(ipcServiceClasses);

    const webDistRoot = resolveWebDistRoot();
    registerAppProtocolHandler({
      distRoot: webDistRoot,
      distRootExists: () => existsSync(webDistRoot),
    });

    registerOnboardingIpc(createOnboardingStore());
    registerDataRootIpc();
    registerLogsIpc(fileLogger);
    registerContextMenuIpc();
    await installDefaultContextMenu();

    const updater = initUpdater();
    registerUpdaterIpc(updater);
    installAppMenu(() => updater.checkNow());
    const openMainWindow = () =>
      createWindow({
        onFocus: () => updater.silentCheckOnActivate(),
      });
    openMainWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) openMainWindow();
    });
  } catch (error) {
    showFatalErrorWindow(error);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
