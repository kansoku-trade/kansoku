import { BrowserWindow, Menu } from 'electron';
import { getIpcContext, IpcMethod, IpcService } from 'electron-ipc-decorator';
import { buildNativeContextMenuTemplate, type NativeContextMenuItem } from './buildTemplate.js';

export type ContextMenuPopupRequest = {
  items: NativeContextMenuItem[];
  x: number;
  y: number;
};

export type ContextMenuPopupResult = {
  selectedKey: string | null;
};

export class ContextMenuIpc extends IpcService {
  static readonly groupName = 'contextMenu';

  @IpcMethod()
  async popup(request: ContextMenuPopupRequest): Promise<ContextMenuPopupResult> {
    const items = Array.isArray(request?.items) ? request.items : [];
    if (items.length === 0) return { selectedKey: null };

    const { sender } = getIpcContext();
    const win = BrowserWindow.fromWebContents(sender);
    let selectedKey: string | null = null;

    const menu = Menu.buildFromTemplate(
      buildNativeContextMenuTemplate(items, (key) => {
        selectedKey = key;
      }),
    );

    await new Promise<void>((resolve) => {
      menu.popup({
        window: win ?? undefined,
        x: Number.isFinite(request.x) ? Math.round(request.x) : undefined,
        y: Number.isFinite(request.y) ? Math.round(request.y) : undefined,
        callback: () => resolve(),
      });
    });

    return { selectedKey };
  }
}
