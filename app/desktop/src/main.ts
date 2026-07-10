import { existsSync } from "node:fs";
import { join } from "node:path";
import { app, BrowserWindow, dialog } from "electron";
import { registerAppProtocolHandler, registerAppScheme } from "./protocolHost.js";
import { resolveRepoRoot } from "./repoRoot.js";
import { initUpdater } from "./updater.js";

// Scheme registration must run before app.ready — calling it at module top
// level (evaluated on import, ahead of the whenReady() handler below) makes
// that ordering impossible to get wrong regardless of what else this file
// grows into.
registerAppScheme();

process.env.TRADE_PROJECT_ROOT = resolveRepoRoot();
const repoRoot = process.env.TRADE_PROJECT_ROOT;

const DEV_WEB_URL = "http://localhost:5199";
const PROD_APP_URL = "app://-/index.html";
const WEB_DIST_ROOT = join(repoRoot, "app", "web", "dist");

async function bootKernel() {
  const { initServerRuntime } = await import("../../server/src/runtimeInit.js");
  const { createKernel } = await import("../../server/src/bootstrap.js");

  initServerRuntime();
  const kernel = await createKernel();
  const apiApp = kernel.app.getInstance();

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

  const url = process.env.ELECTRON_DEV === "1" ? DEV_WEB_URL : PROD_APP_URL;
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
