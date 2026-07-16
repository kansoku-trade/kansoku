import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { app, BrowserWindow } from "electron";
import { CREDITS } from "../../../shared/credits.js";
import { LICENSE_TEXT } from "../../../shared/licenseText.js";
import { APP_ICON_PNG, applyWindowSecurity } from "./mainWindow.js";

const ABOUT_WIDTH = 340;
const ABOUT_HEIGHT = 480;

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function iconDataUrl(): string {
  const candidates = [join(process.resourcesPath ?? "", "icon.png"), APP_ICON_PNG];
  const found = candidates.find((path) => path && existsSync(path));
  if (!found) return "";
  return `data:image/png;base64,${readFileSync(found).toString("base64")}`;
}

export function buildAboutHtml(options: { version: string; iconUrl: string }): string {
  const creditRows = CREDITS.map(
    (entry) =>
      `<li><span class="n">${escapeHtml(entry.name)}</span><span class="v">${escapeHtml(entry.version)}</span><span class="l">${escapeHtml(entry.license)}</span></li>`,
  ).join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>关于 Kansoku</title>
<style>
  :root { color-scheme: light dark; }
  html, body { margin: 0; height: 100%; }
  body {
    font: 13px -apple-system, system-ui, sans-serif;
    background: transparent;
    color: light-dark(#1d1d1f, #e8e8e8);
    display: flex; flex-direction: column; align-items: center;
    padding: 44px 20px 20px; box-sizing: border-box;
    -webkit-user-select: none; user-select: none;
    overflow: hidden;
  }
  .drag { position: fixed; top: 0; left: 0; right: 0; height: 36px; -webkit-app-region: drag; }
  img.icon { width: 96px; height: 96px; }
  h1 { font-size: 17px; font-weight: 600; margin: 10px 0 2px; }
  .version { font-size: 11px; color: light-dark(#6e6e73, #98989d); }
  .copyright { font-size: 11px; color: light-dark(#6e6e73, #98989d); margin-top: 2px; }
  .license-name { font-size: 11px; color: light-dark(#6e6e73, #98989d); }
  .links { margin-top: 10px; font-size: 12px; }
  a { color: light-dark(#0066cc, #4da3ff); text-decoration: none; }
  .panels { width: 100%; margin-top: 14px; overflow-y: auto; flex: 1; }
  details { margin-bottom: 8px; }
  summary { cursor: default; font-size: 12px; color: light-dark(#6e6e73, #98989d); }
  pre.license {
    font: 10px ui-monospace, monospace; white-space: pre-wrap;
    max-height: 200px; overflow-y: auto; -webkit-user-select: text; user-select: text;
    background: light-dark(rgba(0,0,0,.05), rgba(255,255,255,.06));
    border-radius: 6px; padding: 8px; margin: 6px 0 0;
  }
  ul.credits {
    list-style: none; margin: 6px 0 0; padding: 0; font-size: 11px;
    max-height: 200px; overflow-y: auto;
  }
  ul.credits li { display: flex; gap: 6px; padding: 1px 2px; }
  ul.credits .n { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  ul.credits .v { color: light-dark(#6e6e73, #98989d); }
  ul.credits .l { color: light-dark(#6e6e73, #98989d); min-width: 70px; text-align: right; }
</style>
</head>
<body>
<div class="drag"></div>
${options.iconUrl ? `<img class="icon" src="${options.iconUrl}" alt="">` : ""}
<h1>Kansoku</h1>
<div class="version">版本 ${escapeHtml(options.version)}</div>
<div class="copyright">© 2026 Innei</div>
<div class="license-name">AGPL-3.0 + Commons Clause</div>
<div class="links"><a href="https://github.com/Innei/kansoku">GitHub</a></div>
<div class="panels">
  <details><summary>许可证全文</summary><pre class="license">${escapeHtml(LICENSE_TEXT)}</pre></details>
  <details><summary>第三方开源组件（${CREDITS.length}）</summary><ul class="credits">${creditRows}</ul></details>
</div>
</body>
</html>`;
}

let aboutWindow: BrowserWindow | null = null;

export function isAboutWindow(win: BrowserWindow): boolean {
  return aboutWindow === win;
}

export function openAboutWindow(): BrowserWindow {
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    aboutWindow.focus();
    return aboutWindow;
  }

  const win = new BrowserWindow({
    width: ABOUT_WIDTH,
    height: ABOUT_HEIGHT,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    titleBarStyle: "hiddenInset",
    vibrancy: "under-window",
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  applyWindowSecurity(win, undefined);
  win.once("ready-to-show", () => win.show());
  win.on("closed", () => {
    if (aboutWindow === win) aboutWindow = null;
  });

  const html = buildAboutHtml({ version: app.getVersion(), iconUrl: iconDataUrl() });
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  aboutWindow = win;
  return win;
}
