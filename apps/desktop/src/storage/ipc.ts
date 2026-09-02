import { IpcMethod, IpcService } from 'electron-ipc-decorator';
import { app } from 'electron';
import { dataRoot, IS_DEV, userDataPath, workspaceMode } from '../boot/env.js';
import { openAgentWorkspace } from './openWorkspace.js';
import { restoreWorkspaceToLocal } from './restoreLocal.js';

export class WorkspaceIpc extends IpcService {
  static readonly groupName = 'workspace';

  @IpcMethod()
  get() {
    return {
      path: dataRoot,
      mode: IS_DEV
        ? ('dev-repo' as const)
        : workspaceMode.mode === 'icloud'
          ? ('iCloud' as const)
          : ('local' as const),
    };
  }

  @IpcMethod()
  open() {
    return openAgentWorkspace();
  }

  @IpcMethod()
  async restoreLocal() {
    if (workspaceMode.mode !== 'icloud') return { restored: false };
    const result = await restoreWorkspaceToLocal({ sourceRoot: dataRoot, userDataPath });
    app.relaunch();
    app.exit(0);
    return { restored: true, ...result };
  }
}
