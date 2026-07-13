export interface DataRootBridgeStatus {
  effectivePath: string;
  configuredPath: string | null;
  mode: "default" | "custom" | "env" | "dev-repo";
  degraded: boolean;
  degradedReason?: string;
  restartPending?: boolean;
}

export interface DesktopDataRootBridge {
  get(): Promise<DataRootBridgeStatus>;
  pick(): Promise<void>;
  reset(): Promise<void>;
}

interface DesktopGlobal {
  dataRoot?: DesktopDataRootBridge;
}

export function getDesktopDataRootBridge(
  win: unknown = typeof window === "undefined" ? undefined : window,
): DesktopDataRootBridge | null {
  return (win as { desktop?: DesktopGlobal } | undefined)?.desktop?.dataRoot ?? null;
}

export function isDataRootResetDisabled(
  status: DataRootBridgeStatus | null,
  busy: boolean,
): boolean {
  if (busy || !status) return true;
  if (status.mode === "env") return true;
  if (status.degraded) return false;
  if (status.restartPending) return false;
  if (status.mode === "custom") return false;
  if (status.configuredPath) return false;
  return true;
}
