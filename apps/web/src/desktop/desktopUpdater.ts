import { getShellRpc } from './shellRpc';

export type UpdaterUiStatus =
  | { kind: 'unknown' }
  | { kind: 'up-to-date'; current: string; latest: string }
  | { kind: 'available'; version: string; htmlUrl: string }
  | { kind: 'error'; message: string };

export interface DesktopUpdaterBridge {
  getStatus(): Promise<UpdaterUiStatus>;
  onStatus(cb: (status: UpdaterUiStatus) => void): () => void;
  installNow(): Promise<void>;
}

interface DesktopGlobal {
  updater?: Pick<DesktopUpdaterBridge, 'onStatus'>;
}

export function getDesktopUpdaterBridge(
  win: unknown = typeof window === 'undefined' ? undefined : window,
): DesktopUpdaterBridge | null {
  const rpc = getShellRpc(win);
  const push = (win as { desktop?: DesktopGlobal } | undefined)?.desktop?.updater;
  if (!rpc || !push?.onStatus) return null;
  return {
    getStatus: () => rpc.invoke('updater.getStatus') as Promise<UpdaterUiStatus>,
    onStatus: (cb) => push.onStatus(cb),
    installNow: () => rpc.invoke('updater.installNow') as Promise<void>,
  };
}

export function isAvailableStatus(status: UpdaterUiStatus | null | undefined): boolean {
  return status?.kind === 'available';
}
