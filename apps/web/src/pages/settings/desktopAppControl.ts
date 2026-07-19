import { getShellRpc } from '../../desktop/shellRpc';

export interface DesktopAppControlBridge {
  relaunch(): Promise<void>;
}

export function getDesktopAppControlBridge(
  win: unknown = typeof window === 'undefined' ? undefined : window,
): DesktopAppControlBridge | null {
  const rpc = getShellRpc(win);
  if (!rpc) return null;
  return {
    relaunch: () => rpc.invoke('appControl.relaunch') as Promise<void>,
  };
}
