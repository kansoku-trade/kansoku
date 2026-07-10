import { useEffect, useState } from "react";
import { useQuery } from "../apiHooks";
import { getDesktopCredentialsBridge, type CredentialsGetResult } from "../pages/settings/desktopCredentials";
import { clearRestricted, markRestricted } from "../restrictedMode";
import { computeGateStatus, type GateStatus } from "./gateStatus";

export function useCredentialsGate(): {
  status: GateStatus;
  bridge: ReturnType<typeof getDesktopCredentialsBridge>;
  skip: () => void;
  recheck: () => void;
} {
  const bridge = getDesktopCredentialsBridge();
  const [skipped, setSkipped] = useState(false);
  const { data, loading, reload } = useQuery<CredentialsGetResult>(bridge ? "/api/credentials/status" : null);

  useEffect(() => {
    if (data?.configured) clearRestricted();
  }, [data?.configured]);

  const status = computeGateStatus({
    hasDesktopBridge: bridge !== null,
    statusLoading: loading,
    configured: data ? data.configured : null,
    skipped,
  });

  const skip = () => {
    markRestricted();
    setSkipped(true);
  };

  return { status, bridge, skip, recheck: reload };
}
