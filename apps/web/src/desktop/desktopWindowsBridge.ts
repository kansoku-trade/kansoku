export interface WindowsContext {
  windowId: string;
  activeTabId: string;
}

export interface DesktopWindowsBridge {
  getContext?(): Promise<WindowsContext | undefined>;
  reportActiveTab?(activeTabId: string): void;
  openPopout?(symbol: string): Promise<void>;
  openWindow?(activeTabId?: string): Promise<void>;
}

interface DesktopGlobal {
  windows?: DesktopWindowsBridge;
}

export function getDesktopWindowsBridge(
  win: unknown = typeof window === "undefined" ? undefined : window,
): DesktopWindowsBridge | null {
  const bridge = (win as { desktop?: DesktopGlobal } | undefined)?.desktop?.windows;
  return bridge ?? null;
}

export interface WindowsBridge {
  getContext(): Promise<WindowsContext | undefined>;
  reportActiveTab(activeTabId: string): void;
}

export function getWindowsBridge(win: unknown = typeof window === "undefined" ? undefined : window): WindowsBridge | null {
  const bridge = getDesktopWindowsBridge(win);
  if (!bridge || !bridge.getContext || !bridge.reportActiveTab) return null;
  return bridge as WindowsBridge;
}

export interface OpenWindowBridge {
  openWindow(activeTabId?: string): Promise<void>;
}

export function getOpenWindowBridge(
  win: unknown = typeof window === "undefined" ? undefined : window,
): OpenWindowBridge | null {
  const bridge = getDesktopWindowsBridge(win);
  if (!bridge || !bridge.openWindow) return null;
  return bridge as OpenWindowBridge;
}

export interface PopoutBridge {
  openPopout(symbol: string): Promise<void>;
}

export function getPopoutBridge(win: unknown = typeof window === "undefined" ? undefined : window): PopoutBridge | null {
  const bridge = getDesktopWindowsBridge(win);
  if (!bridge || !bridge.openPopout) return null;
  return bridge as PopoutBridge;
}
