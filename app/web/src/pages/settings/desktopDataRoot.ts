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
