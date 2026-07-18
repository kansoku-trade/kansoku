import { BrowserWindow, dialog } from 'electron';
import { WINDOW_BG } from './mainWindow.js';

export function showFatalErrorWindow(error: unknown) {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error('[desktop] fatal startup error', error);

  const win = new BrowserWindow({ width: 720, height: 480, backgroundColor: WINDOW_BG });
  win.loadURL(
    `data:text/html,${encodeURIComponent(
      `<title>trade — startup failed</title><body style="font:13px ui-monospace,monospace;padding:2rem;white-space:pre-wrap;background:${WINDOW_BG};color:#e8e8e8">${message
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')}</body>`,
    )}`,
  );
  dialog.showErrorBox('trade failed to start', message);
}
