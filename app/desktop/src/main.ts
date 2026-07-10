import { existsSync } from "node:fs";
import { join } from "node:path";
import { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage, shell } from "electron";
import { createCredentialsBridgeHandlers, registerCredentialsIpc } from "./credentialsBridge.js";
import { testLongbridgeCredentials } from "./credentialsTest.js";
import { createCredentialStore } from "./credentialStore.js";
import { buildImportManifest, copyImportManifest, validateImportSource } from "./dataImport.js";
import { createDesktopCredentialProvider, selectCredentialProvider } from "./desktopCredentialProvider.js";
import { createDesktopSecretBox } from "./desktopSecretBox.js";
import { createExternalApiController, type ExternalApiController } from "./externalApi.js";
import { isAllowedNavigationUrl, isExternalHttpUrl } from "./navigationGuard.js";
import { registerAppProtocolHandler, registerAppScheme } from "./protocolHost.js";
import { resolveDataRoot, resolveRepoRoot, scaffoldDataRoot } from "./repoRoot.js";
import { initUpdater } from "./updater.js";

// Scheme registration must run before app.ready — calling it at module top
// level (evaluated on import, ahead of the whenReady() handler below) makes
// that ordering impossible to get wrong regardless of what else this file
// grows into.
registerAppScheme();

// package.json's "name" is the scoped npm id ("@trade/desktop"), which
// Electron would otherwise use verbatim for app.getPath("userData") — the
// "/" turns into a nested folder. Pin it to productName before any path
// resolution runs.
app.setName("TradeCharts");

const dataRoot = resolveDataRoot({
  isPackaged: app.isPackaged,
  envOverride: process.env.TRADE_PROJECT_ROOT,
  userDataPath: app.getPath("userData"),
});
if (app.isPackaged) {
  scaffoldDataRoot(dataRoot);
  process.env.TRADE_MIGRATIONS_DIR = join(process.resourcesPath, "drizzle");
}
process.env.TRADE_PROJECT_ROOT = dataRoot;

const DEV_WEB_URL = "http://localhost:5199";
const PROD_APP_URL = "app://-/index.html";
const WEB_DIST_ROOT = app.isPackaged
  ? join(process.resourcesPath, "web-dist")
  : join(resolveRepoRoot(), "app", "web", "dist");
const IS_DEV = process.env.ELECTRON_DEV === "1";

let externalApiController: ExternalApiController | undefined;

async function bootKernel() {
  const { initServerRuntime } = await import("../../server/src/runtimeInit.js");
  const { createKernel } = await import("../../server/src/bootstrap.js");
  const { attachRealtimeBridge } = await import("./realtimeBridge.js");
  const { envCredentialProvider } = await import("../../server/src/services/credentials/envCredentialProvider.js");
  const { CHART_DATA_DIR } = await import("../../server/src/env.js");

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

  initServerRuntime({ credentialProvider, secretBox });
  const kernel = await createKernel();
  const apiApp = kernel.app.getInstance();
  attachRealtimeBridge();
  registerCredentialsIpc(
    ipcMain,
    createCredentialsBridgeHandlers({ provider: desktopProvider, testCredentials: testLongbridgeCredentials }),
  );

  const health = await apiApp.fetch(new Request("http://localhost/api/health"));
  console.log(`[desktop] kernel self-test /api/health -> ${health.status}`, await health.text());

  return kernel;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(app.getAppPath(), "dist-preload", "preload.cjs"),
    },
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

// The preload only exposes desktop.externalApi to app:// pages (mirrors the
// __DESKTOP_RT__ gate), so these handlers don't re-check the sender origin.
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

async function runImportFromRepoFlow(win: BrowserWindow | null): Promise<void> {
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
  await messageBox(win, {
    type: "info",
    title: "从 repo 导入数据",
    message: `导入完成：复制 ${result.copied} 个文件，跳过 ${result.skipped} 个。`,
  });
}

function buildAppMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        {
          label: "从 repo 导入数据…",
          click: () => {
            void runImportFromRepoFlow(BrowserWindow.getFocusedWindow());
          },
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function showFatalErrorWindow(error: unknown) {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error("[desktop] fatal startup error", error);

  const win = new BrowserWindow({ width: 720, height: 480 });
  win.loadURL(
    `data:text/html,${encodeURIComponent(
      `<title>trade — startup failed</title><body style="font:13px ui-monospace,monospace;padding:2rem;white-space:pre-wrap">${message
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

    registerAppProtocolHandler({
      kernelFetch: async (request) => apiApp.fetch(request),
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
