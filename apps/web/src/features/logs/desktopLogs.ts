import { getShellRpc } from '../desktop/shellRpc';

export interface LogsInfo {
  path: string;
  dir: string;
}

export interface LogsTailResult {
  path: string;
  text: string;
}

export interface DesktopLogsBridge {
  getInfo(): Promise<LogsInfo>;
  tail(opts?: { maxBytes?: number }): Promise<LogsTailResult>;
  reveal(): Promise<{ ok: true }>;
  openDir(): Promise<{ ok: boolean; error?: string }>;
}

export function getDesktopLogsBridge(
  win: unknown = typeof window === 'undefined' ? undefined : window,
): DesktopLogsBridge | null {
  const rpc = getShellRpc(win);
  if (!rpc) return null;
  return {
    getInfo: () => rpc.invoke('logs.getInfo') as Promise<LogsInfo>,
    tail: (opts?: { maxBytes?: number }) => rpc.invoke('logs.tail', opts) as Promise<LogsTailResult>,
    reveal: () => rpc.invoke('logs.reveal') as Promise<{ ok: true }>,
    openDir: () => rpc.invoke('logs.openDir') as Promise<{ ok: boolean; error?: string }>,
  };
}
