import { getShellRpc } from '../../desktop/shellRpc';
import type { ElectronContextMenuPopupRequest, ElectronContextMenuPopupResult } from './types';

export interface DesktopContextMenuBridge {
  popup(request: ElectronContextMenuPopupRequest): Promise<ElectronContextMenuPopupResult>;
}

export function getDesktopContextMenuBridge(
  win: unknown = typeof window === 'undefined' ? undefined : window,
): DesktopContextMenuBridge | null {
  const rpc = getShellRpc(win);
  if (!rpc) return null;
  return {
    popup: (request) =>
      rpc.invoke('contextMenu.popup', request) as Promise<ElectronContextMenuPopupResult>,
  };
}
