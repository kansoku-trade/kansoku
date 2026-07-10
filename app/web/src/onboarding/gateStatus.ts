export type GateStatus = "loading" | "onboarding" | "ready";

export function computeGateStatus(params: {
  hasDesktopBridge: boolean;
  statusLoading: boolean;
  configured: boolean | null;
  skipped: boolean;
}): GateStatus {
  if (!params.hasDesktopBridge) return "ready";
  if (params.statusLoading) return "loading";
  if (params.configured === true) return "ready";
  if (params.configured === null) return "ready";
  if (params.skipped) return "ready";
  return "onboarding";
}
