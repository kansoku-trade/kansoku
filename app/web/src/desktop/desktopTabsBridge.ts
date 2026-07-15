export type TabsCommand =
  | "new-tab"
  | "close-tab"
  | "next-tab"
  | "prev-tab"
  | "open-settings"
  | "open-logs"
  | "open-research"
  | "open-chat";

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
  | { op: "open"; route: string; id?: string }
  | { op: "close"; id: string }
  | { op: "closeOthers"; id: string }
  | { op: "closeToRight"; id: string }
  | { op: "updateRoute"; id: string; route: string }
  | { op: "updateTitle"; id: string; title: string }
  | { op: "updateScroll"; id: string; scrollY: number }
  | { op: "adopt"; tabs: TabState[] };

export interface DesktopTabsBridge {
  onCommand(cb: (command: TabsCommand) => void): () => void;
  getSnapshot?(): Promise<TabsSnapshot>;
  mutate?(op: TabsMutateOp): Promise<TabsSnapshot>;
  onSnapshot?(cb: (snapshot: TabsSnapshot) => void): () => void;
}

interface DesktopGlobal {
  tabs?: DesktopTabsBridge;
}

export function getDesktopTabsBridge(
  win: unknown = typeof window === "undefined" ? undefined : window,
): DesktopTabsBridge | null {
  const bridge = (win as { desktop?: DesktopGlobal } | undefined)?.desktop?.tabs;
  return bridge ?? null;
}

export interface SharedTabsBridge {
  getSnapshot(): Promise<TabsSnapshot>;
  mutate(op: TabsMutateOp): Promise<TabsSnapshot>;
  onSnapshot(cb: (snapshot: TabsSnapshot) => void): () => void;
}

export function getSharedTabsBridge(win: unknown = typeof window === "undefined" ? undefined : window): SharedTabsBridge | null {
  const bridge = getDesktopTabsBridge(win);
  if (!bridge || !bridge.getSnapshot || !bridge.mutate || !bridge.onSnapshot) return null;
  return bridge as SharedTabsBridge;
}
