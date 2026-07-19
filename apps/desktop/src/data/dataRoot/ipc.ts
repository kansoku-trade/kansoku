import { BrowserWindow } from 'electron';
import { IpcMethod, IpcService } from 'electron-ipc-decorator';
import { dataRootStatus } from '../../boot/env.js';
import { runResetDataRootFlow, runSelectDataRootFlow } from './flow.js';
import { getDataRootRestartPending } from './restartState.js';

export class DataRootIpc extends IpcService {
  static readonly groupName = 'dataRoot';

  @IpcMethod()
  get() {
    return {
      ...dataRootStatus,
      restartPending: getDataRootRestartPending(),
    };
  }

  @IpcMethod()
  pick() {
    return runSelectDataRootFlow(BrowserWindow.getFocusedWindow());
  }

  @IpcMethod()
  reset() {
    return runResetDataRootFlow(BrowserWindow.getFocusedWindow());
  }
}

export { getDataRootRestartPending };
