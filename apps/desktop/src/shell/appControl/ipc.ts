import { app } from 'electron';
import { IpcMethod, IpcService } from 'electron-ipc-decorator';

export class AppControlIpc extends IpcService {
  static readonly groupName = 'appControl';

  @IpcMethod()
  relaunch() {
    app.relaunch();
    app.quit();
  }
}
