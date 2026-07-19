import { dirname } from 'node:path';
import { shell } from 'electron';
import { IpcMethod, IpcService } from 'electron-ipc-decorator';
import type { FileLogger } from './fileLogger.js';

export type LogsInfo = {
  path: string;
  dir: string;
};

export type LogsTailResult = {
  path: string;
  text: string;
};

export class LogsIpc extends IpcService {
  static readonly groupName = 'logs';

  constructor(private readonly logger: FileLogger) {
    super();
  }

  @IpcMethod()
  getInfo(): LogsInfo {
    return {
      path: this.logger.path,
      dir: dirname(this.logger.path),
    };
  }

  @IpcMethod()
  tail(opts?: { maxBytes?: number }): LogsTailResult {
    return {
      path: this.logger.path,
      text: this.logger.tail(opts?.maxBytes),
    };
  }

  @IpcMethod()
  reveal(): { ok: true } {
    shell.showItemInFolder(this.logger.path);
    return { ok: true };
  }

  @IpcMethod()
  async openDir(): Promise<{ ok: boolean; error?: string }> {
    const result = await shell.openPath(dirname(this.logger.path));
    if (result) return { ok: false, error: result };
    return { ok: true };
  }
}
