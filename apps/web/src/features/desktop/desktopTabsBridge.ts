import { getShellRpc } from './shellRpc';

export type TabsCommand =
  | 'new-tab'
  | 'close-tab'
  | 'next-tab'
  | 'prev-tab'
  | 'open-settings'
  | 'open-logs'
  | 'open-research'
  | 'open-chat';

export interface TabState {
  id: string;
  route: string;
  title: string;
  scrollY: number;
}

export interface TabsSnapshot {
  revision: number;
  tabs: TabState[];
}

export type TabsMutateOp =
  | { op: 'open'; route: string; id?: string }
  | { op: 'close'; id: string }
  | { op: 'closeOthers'; id: string }
  | { op: 'closeToRight'; id: string }
  | { op: 'updateRoute'; id: string; route: string }
  | { op: 'updateTitle'; id: string; title: string }
  | { op: 'updateScroll'; id: string; scrollY: number }
  | { op: 'adopt'; tabs: TabState[] };

export interface DesktopTabsBridge {
  onCommand(cb: (command: TabsCommand) => void): () => void;
}

interface DesktopGlobal {
  tabs?: {
    onCommand?(cb: (command: TabsCommand) => void): () => void;
    onSnapshot?(cb: (snapshot: TabsSnapshot) => void): () => void;
  };
}

function getTabsPush(win: unknown): DesktopGlobal['tabs'] | undefined {
  return (win as { desktop?: DesktopGlobal } | undefined)?.desktop?.tabs;
}

export function getDesktopTabsBridge(
  win: unknown = typeof window === 'undefined' ? undefined : window,
): DesktopTabsBridge | null {
  const push = getTabsPush(win);
  if (!push?.onCommand) return null;
  return { onCommand: push.onCommand.bind(push) };
}

export interface SharedTabsBridge {
  getSnapshot(): Promise<TabsSnapshot>;
  mutate(op: TabsMutateOp): Promise<TabsSnapshot>;
  onSnapshot(cb: (snapshot: TabsSnapshot) => void): () => void;
}

export function getSharedTabsBridge(
  win: unknown = typeof window === 'undefined' ? undefined : window,
): SharedTabsBridge | null {
  const rpc = getShellRpc(win);
  const push = getTabsPush(win);
  if (!rpc || !push?.onSnapshot) return null;
  const onSnapshot = push.onSnapshot.bind(push);
  return {
    getSnapshot: () => rpc.invoke('tabs.getSnapshot') as Promise<TabsSnapshot>,
    mutate: (op: TabsMutateOp) => rpc.invoke('tabs.mutate', op) as Promise<TabsSnapshot>,
    onSnapshot,
  };
}
