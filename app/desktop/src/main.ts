import { join } from "node:path";
import { app, BrowserWindow } from "electron";
import { resolveRepoRoot } from "./repoRoot.js";

process.env.TRADE_PROJECT_ROOT = resolveRepoRoot();

const DEV_WEB_URL = "http://localhost:5199";
const PLACEHOLDER_HTML = `data:text/html,${encodeURIComponent(
  "<title>trade</title><body style=\"font:14px system-ui;padding:2rem\">packaged host arrives in a later task</body>",
)}`;

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

  const url = process.env.ELECTRON_DEV === "1" ? DEV_WEB_URL : PLACEHOLDER_HTML;
  win.loadURL(url);
}

app.whenReady().then(async () => {
  await bootKernel();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
