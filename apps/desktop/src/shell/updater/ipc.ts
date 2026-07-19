import { BrowserWindow } from 'electron';
import { IpcMethod, IpcService } from 'electron-ipc-decorator';
import { UPDATER_CHANNELS } from './channels.js';
import type { UpdaterHandle } from './updater.js';
import type { UpdaterUiStatus } from './status.js';

export class UpdaterIpc extends IpcService {
  static readonly groupName = 'updater';

  constructor(private readonly updater: UpdaterHandle) {
    super();
    this.updater.onStatus((status) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (win.isDestroyed()) continue;
        win.webContents.send(UPDATER_CHANNELS.status, status);
      }
    });
  }

  @IpcMethod()
  getStatus(): UpdaterUiStatus {
    return this.updater.getStatus();
  }

  @IpcMethod()
  installNow(): void {
    this.updater.installNow();
  }
}
