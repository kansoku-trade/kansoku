import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, screen } from 'electron';
import { IS_DEV } from '../boot/env.js';
import {
  APP_ICON_PNG,
  applyWindowSecurity,
  DEV_WEB_URL,
  PROD_APP_URL,
  WINDOW_BG,
} from './mainWindow.js';

export const SYMBOL_PATTERN = /^(?=.*[\da-z])[\d.a-z\-]{1,20}$/i;

export const POPOUT_DEFAULT_WIDTH = 520;
export const POPOUT_DEFAULT_HEIGHT = 420;
export const POPOUT_MIN_WIDTH = 360;
export const POPOUT_MIN_HEIGHT = 300;
export const POPOUT_CASCADE_OFFSET = 24;

export function isValidPopoutSymbol(symbol: string): boolean {
  return SYMBOL_PATTERN.test(symbol);
}

export function popoutRoute(symbol: string): string {
  return `/popout/symbol/${encodeURIComponent(symbol)}`;
}

export function popoutUrl(symbol: string): string {
  return new URL(popoutRoute(symbol), IS_DEV ? DEV_WEB_URL : PROD_APP_URL).toString();
}

export function cascadePosition(
  anchor: { x: number; y: number },
  index: number,
  offset: number = POPOUT_CASCADE_OFFSET,
): { x: number; y: number } {
  return { x: anchor.x + offset * index, y: anchor.y + offset * index };
}

const popoutWindows = new Set<BrowserWindow>();
let cascadeIndex = 0;

export function isPopoutWindow(win: BrowserWindow): boolean {
  return popoutWindows.has(win);
}

export function popoutWindowCount(): number {
  return popoutWindows.size;
}

function nextCascadePosition(): { x: number; y: number } {
  const { workArea } = screen.getPrimaryDisplay();
  const anchor = { x: workArea.x + 80, y: workArea.y + 80 };
  const position = cascadePosition(anchor, cascadeIndex);
  cascadeIndex += 1;
  return position;
}

export function createPopoutWindow(symbol: string): BrowserWindow {
  if (!isValidPopoutSymbol(symbol)) {
    throw new Error(`invalid popout symbol: ${symbol}`);
  }

  const position = nextCascadePosition();

  const win = new BrowserWindow({
    x: position.x,
    y: position.y,
    width: POPOUT_DEFAULT_WIDTH,
    height: POPOUT_DEFAULT_HEIGHT,
    minWidth: POPOUT_MIN_WIDTH,
    minHeight: POPOUT_MIN_HEIGHT,
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

  popoutWindows.add(win);
  win.on('closed', () => {
    popoutWindows.delete(win);
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  const devUrl = IS_DEV ? DEV_WEB_URL : undefined;
  applyWindowSecurity(win, devUrl);

  win.loadURL(popoutUrl(symbol));
  return win;
}
