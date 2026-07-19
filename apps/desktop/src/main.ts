// boot/env.js must stay the FIRST import in this file: its module body sets
// TRADE_PROJECT_ROOT (and app.setName) before anything else runs, and ESM
// import evaluation order is declaration order — every import below this one
// transitively reaches packages/core's env.ts, whose top-level consts read
// TRADE_PROJECT_ROOT once at module-load time. Reordering this import (or
// inserting one above it that reaches core) silently reintroduces a bug
// where env.ts captures an empty/wrong project root in the bundled output.
import './boot/env.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, session } from 'electron';
import { createServices } from 'electron-ipc-decorator';
import { registerAppControlIpc } from './appControl/ipc.js';
import { createAppMenuManager } from './menu/appMenuManager.js';
import { bootKernel } from './boot/kernel.js';
import { createWindowManager } from './window/windowManager.js';
import { showFatalErrorWindow } from './window/fatalErrorWindow.js';
import { applyDevDockIcon } from './window/dockIcon.js';
import { applyContentSecurityPolicy } from './window/csp.js';
import { getCspScriptNonce } from './window/cspNonce.js';
import {
  registerAppProtocolHandler,
  registerAppScheme,
  resolveWebDistRoot,
} from './protocol/protocol.js';
import {
  registerProAssetProtocolHandler,
  registerProAssetScheme,
} from './protocol/proAssetProtocol.js';
import { createOnboardingStore } from './onboarding/store.js';
import { registerOnboardingIpc } from './onboarding/ipc.js';
import { runImportFromRepoFlow } from './dataImport/flow.js';
import { runSelectDataRootFlow } from './dataRoot/flow.js';
import { registerDataRootIpc } from './dataRoot/ipc.js';
import {
  createFileLogger,
  installConsoleBridge,
  resolveMainLogPath,
} from './logging/fileLogger.js';
import { installDefaultContextMenu } from './contextMenu/defaultMenu.js';
import { registerContextMenuIpc } from './contextMenu/ipc.js';
import { registerLogsIpc } from './logging/ipc.js';
import { sendTabsCommand } from './tabs/commands.js';
import { createTabsFileStore, type TabsFileStore } from './tabs/store.js';
import { registerTabsIpc } from './tabs/ipc.js';
import { initUpdater } from './updater/updater.js';
import { registerUpdaterIpc } from './updater/ipc.js';
import { isPopoutWindow } from './window/popoutWindow.js';
import { isAboutWindow, openAboutWindow } from './window/aboutWindow.js';

const fileLogger = createFileLogger({
  logFilePath: resolveMainLogPath(app.getPath('logs')),
});
installConsoleBridge(fileLogger);
console.log(`[desktop] logging to ${fileLogger.path}`);

// Scheme registration must run before app.ready — calling it at module top
// level (evaluated on import, ahead of the whenReady() handler below) makes
// that ordering impossible to get wrong regardless of what else this file
// grows into. pro-asset registers unconditionally too, even though the
// bundle may turn out absent/locked (Electron requires privileged schemes
// to be registered before app.ready() regardless of runtime availability).
registerAppScheme();
registerProAssetScheme();

function installAppMenu(checkForUpdates: () => void, openWindow: () => void): void {
  createAppMenuManager({
    appName: app.name,
    deps: {
      openAbout: () => {
        openAboutWindow();
      },
      importFromRepo: () => {
        runImportFromRepoFlow(BrowserWindow.getFocusedWindow()).catch((error: unknown) => {
          console.error('[desktop] import-from-repo flow crashed', error);
        });
      },
      selectDataRoot: () => {
        runSelectDataRootFlow(BrowserWindow.getFocusedWindow()).catch((error: unknown) => {
          console.error('[desktop] select-data-root flow crashed', error);
        });
      },
      openSettings: () => sendTabsCommand('open-settings'),
      openLogs: () => sendTabsCommand('open-logs'),
      openResearch: () => sendTabsCommand('open-research'),
      openChat: () => sendTabsCommand('open-chat'),
      checkForUpdates,
      newWindow: openWindow,
      newTab: () => sendTabsCommand('new-tab'),
      closeTab: () => {
        const focused = BrowserWindow.getFocusedWindow();
        if (focused && (isPopoutWindow(focused) || isAboutWindow(focused))) {
          focused.close();
          return;
        }
        sendTabsCommand('close-tab');
      },
      nextTab: () => sendTabsCommand('next-tab'),
      prevTab: () => sendTabsCommand('prev-tab'),
    },
  }).install();
}

app.whenReady().then(async () => {
  try {
    applyDevDockIcon();
    const { ipcServiceClasses, webManifest, dispose: disposeEdition } = await bootKernel();
    createServices(ipcServiceClasses);

    applyContentSecurityPolicy(session.defaultSession, {
      extraScriptSrcOrigins: ['https://vibeloft.ai'],
      scriptNonce: getCspScriptNonce(),
    });

    const webDistRoot = resolveWebDistRoot();
    registerAppProtocolHandler({
      distRoot: webDistRoot,
      distRootExists: () => existsSync(webDistRoot),
    });
    registerProAssetProtocolHandler(webManifest);

    registerOnboardingIpc(createOnboardingStore());
    registerAppControlIpc();
    registerDataRootIpc();
    const tabsFileStore: TabsFileStore = createTabsFileStore(
      join(app.getPath('userData'), 'tabs.json'),
    );
    registerTabsIpc(tabsFileStore);
    registerLogsIpc(fileLogger);
    registerContextMenuIpc();
    await installDefaultContextMenu();

    const updater = await initUpdater();
    registerUpdaterIpc(updater);

    const windowManager = await createWindowManager({
      userDataDir: app.getPath('userData'),
      onWindowFocus: () => updater.silentCheckOnActivate(),
    });
    installAppMenu(
      () => updater.checkNow(),
      () => windowManager.openWindow(),
    );
    windowManager.restoreWindows();

    app.on('activate', () => {
      if (windowManager.windowCount() === 0) windowManager.restoreWindows();
    });

    // Quit must never be interrupted: Sparkle's installer asks the app to
    // terminate, and a will-quit preventDefault (even followed by a re-quit)
    // makes Sparkle treat the install as cancelled — the app exits with no
    // update applied and no relaunch. Flush synchronously instead.
    app.on('before-quit', () => {
      try {
        tabsFileStore.flushSync();
        windowManager.flushSync();
      } catch (error) {
        console.error('[desktop] flush on quit failed', error);
      }
      void disposeEdition().catch((error) => console.error('[desktop] edition dispose on quit failed', error));
    });
  } catch (error) {
    showFatalErrorWindow(error);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
