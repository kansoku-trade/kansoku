import { existsSync } from "node:fs";
import { join } from "node:path";
import { app, BrowserWindow, dialog, shell } from "electron";
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

async function bootKernel() {
  const { initServerRuntime } = await import("../../server/src/runtimeInit.js");
  const { createKernel } = await import("../../server/src/bootstrap.js");
  const { attachRealtimeBridge } = await import("./realtimeBridge.js");

  initServerRuntime();
  const kernel = await createKernel();
  const apiApp = kernel.app.getInstance();
  attachRealtimeBridge();

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

  const isDev = process.env.ELECTRON_DEV === "1";
  const devUrl = isDev ? DEV_WEB_URL : undefined;

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

  const url = isDev ? DEV_WEB_URL : PROD_APP_URL;
  win.loadURL(url);
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
