import type {
  ElectronContextMenuPopupRequest,
  ElectronContextMenuPopupResult,
} from "./types";

export interface DesktopContextMenuBridge {
  popup(request: ElectronContextMenuPopupRequest): Promise<ElectronContextMenuPopupResult>;
}

interface DesktopGlobal {
  contextMenu?: DesktopContextMenuBridge;
}

export function getDesktopContextMenuBridge(
  win: unknown = typeof window === "undefined" ? undefined : window,
): DesktopContextMenuBridge | null {
  return (win as { desktop?: DesktopGlobal } | undefined)?.desktop?.contextMenu ?? null;
}
