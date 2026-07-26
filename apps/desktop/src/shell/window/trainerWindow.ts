import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import { IS_DEV } from '../../boot/env.js';
import { APP_ICON_PNG, applyWindowSecurity, DEV_WEB_URL, WINDOW_BG } from './mainWindow.js';

export const TRAINER_DEFAULT_WIDTH = 1280;
export const TRAINER_DEFAULT_HEIGHT = 860;
export const TRAINER_MIN_WIDTH = 960;
export const TRAINER_MIN_HEIGHT = 640;

export function trainerUrl(): string {
  return IS_DEV ? `${DEV_WEB_URL}/train.html` : 'app://-/train.html';
}

export function createTrainerWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: TRAINER_DEFAULT_WIDTH,
    height: TRAINER_DEFAULT_HEIGHT,
    minWidth: TRAINER_MIN_WIDTH,
    minHeight: TRAINER_MIN_HEIGHT,
    backgroundColor: WINDOW_BG,
    show: false,
    fullscreenable: true,
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

  win.once('ready-to-show', () => {
    win.show();
  });

  const devUrl = IS_DEV ? DEV_WEB_URL : undefined;
  applyWindowSecurity(win, devUrl);

  win.loadURL(trainerUrl());
  return win;
}
