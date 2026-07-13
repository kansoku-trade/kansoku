export type UpdaterUiStatus =
  | { kind: "unknown" }
  | { kind: "up-to-date"; current: string; latest: string }
  | { kind: "available"; version: string; htmlUrl: string }
  | { kind: "error"; message: string };

export interface DesktopUpdaterBridge {
  getStatus(): Promise<UpdaterUiStatus>;
  onStatus(cb: (status: UpdaterUiStatus) => void): () => void;
  installNow(): Promise<void>;
}

interface DesktopGlobal {
  updater?: DesktopUpdaterBridge;
}

export function getDesktopUpdaterBridge(
  win: unknown = typeof window === "undefined" ? undefined : window,
): DesktopUpdaterBridge | null {
  return (win as { desktop?: DesktopGlobal } | undefined)?.desktop?.updater ?? null;
}

export function isAvailableStatus(status: UpdaterUiStatus | null | undefined): boolean {
  return status?.kind === "available";
}
