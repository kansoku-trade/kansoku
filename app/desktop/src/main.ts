// bootEnv.js must stay the FIRST import in this file: its module body sets
// TRADE_PROJECT_ROOT (and app.setName) before anything else runs, and ESM
// import evaluation order is declaration order — every import below this one
// transitively reaches packages/core's env.ts, whose top-level consts read
// TRADE_PROJECT_ROOT once at module-load time. Reordering this import (or
// inserting one above it that reaches core) silently reintroduces a bug
// where env.ts captures an empty/wrong project root in the bundled output.
import { dataRoot } from "./bootEnv.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage, shell } from "electron";
import { createServices } from "electron-ipc-decorator";
import { createCredentialsBridgeHandlers, registerCredentialsIpc } from "./credentialsBridge.js";
import { testLongbridgeCredentials } from "./credentialsTest.js";
import { createCredentialStore } from "./credentialStore.js";
import { buildImportManifest, copyImportManifest, validateImportSource } from "./dataImport.js";
import { createDesktopCredentialProvider, selectCredentialProvider } from "./desktopCredentialProvider.js";
import { createDesktopSecretBox } from "./desktopSecretBox.js";
import { createExternalApiController, type ExternalApiController } from "./externalApi.js";
import { isAllowedNavigationUrl, isExternalHttpUrl } from "./navigationGuard.js";
import { DEFAULT_LONGBRIDGE_OAUTH_CLIENT_ID, performOAuthLogin } from "./oauthLogin.js";
import { registerAppProtocolHandler, registerAppScheme } from "./protocolHost.js";
import { resolveRepoRoot } from "./repoRoot.js";
import { TABS_COMMAND_CHANNEL, type TabsCommand } from "./tabsChannels.js";
import { initUpdater } from "./updater.js";

// Scheme registration must run before app.ready — calling it at module top
// level (evaluated on import, ahead of the whenReady() handler below) makes
// that ordering impossible to get wrong regardless of what else this file
// grows into.
registerAppScheme();

const DEV_WEB_URL = "http://localhost:5199";
const PROD_APP_URL = "app://-/index.html";
const WEB_DIST_ROOT = app.isPackaged
  ? join(process.resourcesPath, "web-dist")
  : join(resolveRepoRoot(), "app", "web", "dist");
const IS_DEV = process.env.ELECTRON_DEV === "1";
// Match web --bg-canvas so the native surface isn't white before the renderer paints.
const WINDOW_BG = "#0a0a0a";

let externalApiController: ExternalApiController | undefined;

async function bootKernel() {
  const { initServerRuntime } = await import("../../server/src/runtimeInit.js");
  const { createKernel } = await import("../../server/src/bootstrap.js");
  const { attachRealtimeBridge } = await import("./realtimeBridge.js");
  const { envCredentialProvider } = await import("../../packages/core/src/services/credentials/envCredentialProvider.js");
  const { CHART_DATA_DIR } = await import("../../packages/core/src/env.js");

  const credentialStore = createCredentialStore({
    safeStorage,
    filePath: join(app.getPath("userData"), "credentials.json"),
  });
  // One long-lived provider instance, created once and never replaced — see
  // the invariant documented on LongbridgeStream's constructor. set()/clear()
  // notify runtime consumers through this same instance's onChange.
  const desktopProvider = createDesktopCredentialProvider(credentialStore);
  const credentialProvider = selectCredentialProvider({
    isDev: IS_DEV,
    desktopProvider,
    envProvider: envCredentialProvider,
  });

  // Dev keeps the pre-P3 plaintext keyfile so ELECTRON_DEV workflows are
  // unaffected; packaged builds move the AI master key into safeStorage.
  const secretBox = IS_DEV
    ? undefined
    : createDesktopSecretBox({
        safeStorage,
        wrappedKeyPath: join(app.getPath("userData"), "ai-master-key.json"),
        legacyKeyPath: join(CHART_DATA_DIR, "ai-secret.key"),
      });

  initServerRuntime({
    credentialProvider,
    secretBox,
    openAuthUrl: (url) => {
      shell.openExternal(url).catch(() => {});
    },
  });
  const kernel = await createKernel();
  const apiApp = kernel.app.getInstance();
  attachRealtimeBridge();
  registerCredentialsIpc(
    ipcMain,
    createCredentialsBridgeHandlers({
      provider: desktopProvider,
      testCredentials: testLongbridgeCredentials,
      oauthLogin: async () => {
        const result = await performOAuthLogin(DEFAULT_LONGBRIDGE_OAUTH_CLIENT_ID, {
          openUrl: (url) => {
            shell.openExternal(url).catch(() => {});
          },
        });
        if (!result.ok) return result;
        const persisted = desktopProvider.setOAuth(DEFAULT_LONGBRIDGE_OAUTH_CLIENT_ID);
        return persisted.ok ? result : persisted;
      },
    }),
  );

  const health = await apiApp.fetch(new Request("http://localhost/api/health"));
  console.log(`[desktop] kernel self-test /api/health -> ${health.status}`, await health.text());

  return kernel;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: WINDOW_BG,
    show: false,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 12, y: 12 },
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(app.getAppPath(), "dist-preload", "preload.cjs"),
    },
  });

  win.once("ready-to-show", () => {
    win.show();
  });

  win.webContents.on("console-message", (event) => {
    console.log("[renderer]", event.message);
  });

  win.webContents.once("did-finish-load", () => {
    win.webContents.executeJavaScript(
      'console.log("desktop.versions =", JSON.stringify(window.desktop && window.desktop.versions))',
    );
  });

  const devUrl = IS_DEV ? DEV_WEB_URL : undefined;

  // A page loaded via app:// carries the preload's MessagePort kernel access.
  // Without this guard, following an in-app link (e.g. a markdown link in
  // rendered content) to a hostile origin would inherit that same preload.
  win.webContents.on("will-navigate", (event, navUrl) => {
    if (isAllowedNavigationUrl(navUrl, { devUrl })) return;
    event.preventDefault();
    if (isExternalHttpUrl(navUrl)) shell.openExternal(navUrl).catch(() => {});
  });

  win.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    if (isExternalHttpUrl(openUrl)) shell.openExternal(openUrl).catch(() => {});
    return { action: "deny" };
  });

  const url = IS_DEV ? DEV_WEB_URL : PROD_APP_URL;
  win.loadURL(url);
}

// The preload exposes desktop.externalApi only to privileged origins (app://
// pages, or the dev renderer under ELECTRON_DEV — same gate as __DESKTOP_RT__),
// so these handlers don't re-check the sender origin.
function registerExternalApiIpc(controller: ExternalApiController): void {
  ipcMain.handle("desktop:external-api:get-state", () => controller.getState());
  ipcMain.handle("desktop:external-api:enable", () => controller.enable());
  ipcMain.handle("desktop:external-api:disable", () => controller.disable());
  ipcMain.handle("desktop:external-api:reset-token", () => controller.resetToken());
}

function messageBox(win: BrowserWindow | null, options: Electron.MessageBoxOptions): Promise<Electron.MessageBoxReturnValue> {
  return win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options);
}

function openDialog(win: BrowserWindow | null, options: Electron.OpenDialogOptions): Promise<Electron.OpenDialogReturnValue> {
  return win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options);
}

async function runImportFromRepoFlowUnsafe(win: BrowserWindow | null): Promise<void> {
  if (!app.isPackaged) {
    await messageBox(win, {
      type: "info",
      title: "从 repo 导入数据",
      message: "开发模式下数据目录本身就是仓库，无需导入。",
    });
    return;
  }

  const picked = await openDialog(win, {
    title: "选择 trade 仓库目录",
    properties: ["openDirectory"],
  });
  if (picked.canceled || picked.filePaths.length === 0) return;
  const sourceRoot = picked.filePaths[0];

  const validation = validateImportSource(sourceRoot, dataRoot);
  if (!validation.ok) {
    const messages: Record<typeof validation.reason, string> = {
      self: "所选目录就是当前数据目录，无需导入。",
      "missing-journal": "所选目录不像 trade 仓库：找不到 journal/charts/data。",
      empty: "所选目录的 journal/charts/data 里没有可导入的图表文件。",
    };
    await messageBox(win, {
      type: "warning",
      title: "从 repo 导入数据",
      message: messages[validation.reason],
    });
    return;
  }

  const manifest = buildImportManifest(sourceRoot, dataRoot);
  let overwrite = false;
  if (manifest.collisionCount > 0) {
    const choice = await messageBox(win, {
      type: "question",
      buttons: ["取消", "跳过已存在的文件", "覆盖已存在的文件"],
      defaultId: 1,
      cancelId: 0,
      title: "从 repo 导入数据",
      message: `有 ${manifest.collisionCount} 个文件在当前数据目录中已存在，如何处理？`,
    });
    if (choice.response === 0) return;
    overwrite = choice.response === 2;
  }

  const result = copyImportManifest(manifest, { overwrite });
  const summaryLines = [`导入完成：复制 ${result.copied} 个文件，跳过 ${result.skipped} 个。`];
  if (result.failed > 0) {
    summaryLines.push(`有 ${result.failed} 个文件复制失败：`);
    summaryLines.push(...result.failures.map((failure) => `- ${failure.relPath}: ${failure.error}`));
  }
  await messageBox(win, {
    type: result.failed > 0 ? "warning" : "info",
    title: "从 repo 导入数据",
    message: summaryLines.join("\n"),
  });
}

// buildImportManifest/validateImportSource can throw on unreadable dirs
// (permissions, a source deleted mid-flow), and copyImportManifest already
// reports its own per-file failures without throwing — this outer guard
// only exists to catch the former and make sure the promise this hands to
// the menu's click handler never rejects unhandled.
async function runImportFromRepoFlow(win: BrowserWindow | null): Promise<void> {
  try {
    await runImportFromRepoFlowUnsafe(win);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[desktop] import-from-repo failed", error);
    await messageBox(win, {
      type: "error",
      title: "从 repo 导入数据",
      message: `导入失败：${message}`,
    });
  }
}

function sendTabsCommand(command: TabsCommand): void {
  BrowserWindow.getFocusedWindow()?.webContents.send(TABS_COMMAND_CHANNEL, command);
}

function buildAppMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        {
          label: "从 repo 导入数据…",
          click: () => {
            runImportFromRepoFlow(BrowserWindow.getFocusedWindow()).catch((error: unknown) => {
              console.error("[desktop] import-from-repo flow crashed", error);
            });
          },
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { label: "New Tab", accelerator: "CmdOrCtrl+T", click: () => sendTabsCommand("new-tab") },
        { label: "Close Tab", accelerator: "CmdOrCtrl+W", click: () => sendTabsCommand("close-tab") },
        { type: "separator" },
        { label: "Show Next Tab", accelerator: "CmdOrCtrl+Shift+]", click: () => sendTabsCommand("next-tab") },
        { label: "Show Previous Tab", accelerator: "CmdOrCtrl+Shift+[", click: () => sendTabsCommand("prev-tab") },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function showFatalErrorWindow(error: unknown) {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error("[desktop] fatal startup error", error);

  const win = new BrowserWindow({ width: 720, height: 480, backgroundColor: WINDOW_BG });
  win.loadURL(
    `data:text/html,${encodeURIComponent(
      `<title>trade — startup failed</title><body style="font:13px ui-monospace,monospace;padding:2rem;white-space:pre-wrap;background:${WINDOW_BG};color:#e8e8e8">${message
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")}</body>`,
    )}`,
  );
  dialog.showErrorBox("trade failed to start", message);
}

app.whenReady().then(async () => {
  try {
    const kernel = await bootKernel();
    const apiApp = kernel.app.getInstance();
    const { ipcServiceClasses } = await import("./ipc/index.js");
    createServices(ipcServiceClasses);

    registerAppProtocolHandler({
      distRoot: WEB_DIST_ROOT,
      distRootExists: () => existsSync(WEB_DIST_ROOT),
    });

    externalApiController = createExternalApiController(async (request) => apiApp.fetch(request));
    registerExternalApiIpc(externalApiController);
    await externalApiController.boot();

    buildAppMenu();
    createWindow();
    initUpdater();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  } catch (error) {
    showFatalErrorWindow(error);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  void externalApiController?.shutdown();
});
