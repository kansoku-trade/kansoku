import { getIpcContext, IpcMethod, IpcService } from 'electron-ipc-decorator';

export interface WindowsContext {
  windowId: string;
  activeTabId: string;
}

export interface WindowsIpcDeps {
  getContext(senderId: number): WindowsContext | undefined;
  reportActiveTab(senderId: number, activeTabId: string): void;
  openPopout(symbol: string): void;
  openWindow(activeTabId: string): void;
}

export class WindowsIpc extends IpcService {
  static readonly groupName = 'windows';

  constructor(private readonly deps: WindowsIpcDeps) {
    super();
  }

  @IpcMethod()
  getContext(): WindowsContext | undefined {
    return this.deps.getContext(getIpcContext().sender.id);
  }

  @IpcMethod()
  reportActiveTab(activeTabId: string): void {
    this.deps.reportActiveTab(getIpcContext().sender.id, activeTabId);
  }

  @IpcMethod()
  openPopout(symbol: string): void {
    this.deps.openPopout(symbol);
  }

  @IpcMethod()
  openWindow(activeTabId: unknown): void {
    this.deps.openWindow(typeof activeTabId === 'string' ? activeTabId : '');
  }
}
