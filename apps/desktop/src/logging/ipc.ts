import { dirname } from 'node:path';
import { ipcMain, shell } from 'electron';
import type { FileLogger } from './fileLogger.js';

export type LogsInfo = {
  path: string;
  dir: string;
};

export type LogsTailResult = {
  path: string;
  text: string;
};

export function registerLogsIpc(logger: FileLogger): void {
  const dir = dirname(logger.path);

  ipcMain.handle('desktop:logs:get-info', (): LogsInfo => ({
    path: logger.path,
    dir,
  }));

  ipcMain.handle('desktop:logs:tail', (_event, opts?: { maxBytes?: number }): LogsTailResult => ({
    path: logger.path,
    text: logger.tail(opts?.maxBytes),
  }));

  ipcMain.handle('desktop:logs:reveal', async (): Promise<{ ok: true }> => {
    shell.showItemInFolder(logger.path);
    return { ok: true };
  });

  ipcMain.handle('desktop:logs:open-dir', async (): Promise<{ ok: boolean; error?: string }> => {
    const result = await shell.openPath(dir);
    if (result) return { ok: false, error: result };
    return { ok: true };
  });
}
