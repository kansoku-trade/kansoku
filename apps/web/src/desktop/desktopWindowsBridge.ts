import { getShellRpc } from './shellRpc';

export interface WindowsContext {
  windowId: string;
  activeTabId: string;
}

export interface WindowsBridge {
  getContext(): Promise<WindowsContext | undefined>;
  reportActiveTab(activeTabId: string): void;
}

export function getWindowsBridge(
  win: unknown = typeof window === 'undefined' ? undefined : window,
): WindowsBridge | null {
  const rpc = getShellRpc(win);
  if (!rpc) return null;
  return {
    getContext: () => rpc.invoke('windows.getContext') as Promise<WindowsContext | undefined>,
    reportActiveTab: (activeTabId: string) => {
      void rpc.invoke('windows.reportActiveTab', activeTabId);
    },
  };
}

export interface OpenWindowBridge {
  openWindow(activeTabId?: string): Promise<void>;
}

export function getOpenWindowBridge(
  win: unknown = typeof window === 'undefined' ? undefined : window,
): OpenWindowBridge | null {
  const rpc = getShellRpc(win);
  if (!rpc) return null;
  return {
    openWindow: (activeTabId?: string) =>
      rpc.invoke('windows.openWindow', activeTabId ?? '') as Promise<void>,
  };
}

export interface PopoutBridge {
  openPopout(symbol: string): Promise<void>;
}

export function getPopoutBridge(
  win: unknown = typeof window === 'undefined' ? undefined : window,
): PopoutBridge | null {
  const rpc = getShellRpc(win);
  if (!rpc) return null;
  return {
    openPopout: (symbol: string) => rpc.invoke('windows.openPopout', symbol) as Promise<void>,
  };
}
