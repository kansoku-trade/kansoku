import { BrowserWindow, ipcMain } from 'electron';
import { UPDATER_CHANNELS } from './channels.js';
import type { UpdaterHandle } from './updater.js';
import type { UpdaterUiStatus } from './status.js';

export function registerUpdaterIpc(handle: UpdaterHandle): () => void {
  ipcMain.handle(UPDATER_CHANNELS.getStatus, (): UpdaterUiStatus => handle.getStatus());
  ipcMain.handle(UPDATER_CHANNELS.installNow, () => {
    handle.installNow();
  });

  const unsubscribe = handle.onStatus((status) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue;
      win.webContents.send(UPDATER_CHANNELS.status, status);
    }
  });

  return () => {
    unsubscribe();
    ipcMain.removeHandler(UPDATER_CHANNELS.getStatus);
    ipcMain.removeHandler(UPDATER_CHANNELS.installNow);
  };
}
