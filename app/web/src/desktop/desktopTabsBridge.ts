export type TabsCommand = "new-tab" | "close-tab" | "next-tab" | "prev-tab";

export interface DesktopTabsBridge {
  onCommand(cb: (command: TabsCommand) => void): () => void;
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
