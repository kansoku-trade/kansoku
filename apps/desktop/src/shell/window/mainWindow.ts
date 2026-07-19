import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, shell } from 'electron';
import windowStateKeeper from 'electron-window-state';
import { resolveRepoRoot } from '../../boot/paths.js';
import { IS_DEV } from '../../boot/env.js';
import { isAllowedNavigationUrl, isExternalHttpUrl } from './navigationGuard.js';

export const DEV_WEB_URL = 'http://localhost:5199';
export const PROD_APP_URL = 'app://-/index.html';
export const APP_ICON_PNG = join(resolveRepoRoot(), 'apps', 'desktop', 'build', 'icon.png');
// Match web --bg-canvas so the native surface isn't white before the renderer paints.
export const WINDOW_BG = '#0a0a0a';

export function applyWindowSecurity(win: BrowserWindow, devUrl: string | undefined): void {
  win.webContents.on('console-message', (event) => {
    console.log('[renderer]', event.message);
  });

  // A page loaded via app:// carries the preload's MessagePort kernel access.
  // Without this guard, following an in-app link (e.g. a markdown link in
  // rendered content) to a hostile origin would inherit that same preload.
  win.webContents.on('will-navigate', (event, navUrl) => {
    if (isAllowedNavigationUrl(navUrl, { devUrl })) return;
    event.preventDefault();
    if (isExternalHttpUrl(navUrl)) shell.openExternal(navUrl).catch(() => {});
  });

  win.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    if (isExternalHttpUrl(openUrl)) shell.openExternal(openUrl).catch(() => {});
    return { action: 'deny' };
  });
}

export type CreateWindowOptions = {
  onFocus?: () => void;
  stateFileName?: string;
};

export function createWindow(options: CreateWindowOptions = {}): BrowserWindow {
  const windowState = windowStateKeeper({
    defaultWidth: 1440,
    defaultHeight: 900,
    maximize: false,
    fullScreen: false,
    ...(options.stateFileName ? { file: options.stateFileName } : {}),
  });
  const win = new BrowserWindow({
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: WINDOW_BG,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    ...(existsSync(APP_ICON_PNG) ? { icon: APP_ICON_PNG } : {}),
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(app.getAppPath(), 'dist-preload', 'preload.cjs'),
    },
  });

  windowState.manage(win);

  if (options.onFocus) {
    win.on('focus', options.onFocus);
  }

  win.once('ready-to-show', () => {
    win.show();
  });

  win.webContents.once('did-finish-load', () => {
    win.webContents.executeJavaScript(
      'console.log("desktop.versions =", JSON.stringify(window.desktop && window.desktop.versions))',
    );
  });

  const devUrl = IS_DEV ? DEV_WEB_URL : undefined;
  applyWindowSecurity(win, devUrl);

  const url = IS_DEV ? DEV_WEB_URL : PROD_APP_URL;
  win.loadURL(url);
  return win;
}
