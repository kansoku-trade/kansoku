import { IpcMethod, IpcService } from 'electron-ipc-decorator';
import type { TabsService } from './service.js';
import type { MutateOp } from './store.js';

export class TabsIpc extends IpcService {
  static readonly groupName = 'tabs';

  constructor(private readonly tabs: TabsService) {
    super();
  }

  @IpcMethod()
  getSnapshot() {
    return this.tabs.snapshot();
  }

  @IpcMethod()
  mutate(payload: MutateOp) {
    return this.tabs.mutate(payload);
  }
}
