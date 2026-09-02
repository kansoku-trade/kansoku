import { getShellRpc } from '../desktop/shellRpc';

export interface WorkspaceStatus {
  path: string;
  mode: 'local' | 'dev-repo' | 'iCloud';
}

export interface DesktopWorkspaceBridge {
  get(): Promise<WorkspaceStatus>;
  open(): Promise<void>;
  restoreLocal(): Promise<void>;
}

export function getDesktopWorkspaceBridge(
  win: unknown = typeof window === 'undefined' ? undefined : window,
): DesktopWorkspaceBridge | null {
  const rpc = getShellRpc(win);
  if (!rpc) return null;
  return {
    get: () => rpc.invoke('workspace.get') as Promise<WorkspaceStatus>,
    open: () => rpc.invoke('workspace.open') as Promise<void>,
    restoreLocal: () => rpc.invoke('workspace.restoreLocal') as Promise<void>,
  };
}
