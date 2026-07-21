import { getShellRpc } from '../desktop/shellRpc';

export interface DataRootBridgeStatus {
  effectivePath: string;
  configuredPath: string | null;
  mode: 'default' | 'custom' | 'env' | 'dev-repo';
  degraded: boolean;
  degradedReason?: string;
  restartPending?: boolean;
}

export interface DesktopDataRootBridge {
  get(): Promise<DataRootBridgeStatus>;
  pick(): Promise<void>;
  reset(): Promise<void>;
}

export function getDesktopDataRootBridge(
  win: unknown = typeof window === 'undefined' ? undefined : window,
): DesktopDataRootBridge | null {
  const rpc = getShellRpc(win);
  if (!rpc) return null;
  return {
    get: () => rpc.invoke('dataRoot.get') as Promise<DataRootBridgeStatus>,
    pick: () => rpc.invoke('dataRoot.pick') as Promise<void>,
    reset: () => rpc.invoke('dataRoot.reset') as Promise<void>,
  };
}

export function isDataRootResetDisabled(
  status: DataRootBridgeStatus | null,
  busy: boolean,
): boolean {
  if (busy || !status) return true;
  if (status.mode === 'env') return true;
  if (status.degraded) return false;
  if (status.restartPending) return false;
  if (status.mode === 'custom') return false;
  if (status.configuredPath) return false;
  return true;
}
