import { useEffect, useRef, useState } from "react";
import type { IntradayBuilt, TimeframeKey } from "../../../../shared/types";
import { subscribeChannel } from "../../wsHub";

interface PreviewEnvelope {
  type: "data" | "status";
  data?: { built: IntradayBuilt };
  degraded?: boolean;
  error?: string;
}

export interface DecodedPreviewEnvelope {
  built?: IntradayBuilt;
  error?: string;
  degraded?: boolean;
}

export function decodePreviewEnvelope(payload: unknown, hadBuilt: boolean): DecodedPreviewEnvelope {
  const env = payload as PreviewEnvelope;
  if (env?.type === "data" && env.data) return { built: env.data.built, degraded: false };
  if (env?.type === "status") {
    if (!hadBuilt && env.error) return { error: env.error };
    return { degraded: Boolean(env.degraded) };
  }
  return {};
}

export interface IntradayPreviewState {
  built: IntradayBuilt | null;
  error: string | null;
  degraded: boolean;
  intradayTf: TimeframeKey | null;
  setIntradayTf: (tf: TimeframeKey) => void;
}

export function useIntradayPreview(sym: string): IntradayPreviewState {
  const [built, setBuilt] = useState<IntradayBuilt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [degraded, setDegraded] = useState(false);
  const [intradayTf, setIntradayTf] = useState<TimeframeKey | null>(null);
  const hadBuiltRef = useRef(false);

  useEffect(() => {
    setBuilt(null);
    setError(null);
    setDegraded(false);
    setIntradayTf(null);
    hadBuiltRef.current = false;

    const off = subscribeChannel(
      { kind: "preview", symbol: sym },
      (payload) => {
        const result = decodePreviewEnvelope(payload, hadBuiltRef.current);
        if (result.built) {
          hadBuiltRef.current = true;
          setError(null);
          setBuilt(result.built);
        }
        if (result.error !== undefined) setError(result.error);
        if (result.degraded !== undefined) setDegraded(result.degraded);
      },
      (connected) => {
        if (!connected) setDegraded(true);
      },
    );
    return off;
  }, [sym]);

  return { built, error, degraded, intradayTf, setIntradayTf };
}
