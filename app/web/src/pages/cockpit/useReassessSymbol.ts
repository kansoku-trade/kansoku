import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage, isAbortError } from "../../api";

export interface ReassessResponse {
  started: boolean;
  reason?: string;
}

export type ReassessOutcome =
  | { ok: true; data: ReassessResponse }
  | { ok: false; error: string; aborted: boolean };

export function useReassessSymbol(symbol: string): {
  pending: boolean;
  error: string | null;
  reassess: () => Promise<ReassessOutcome>;
} {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setPending(false);
    setError(null);
  }, [symbol]);

  const reassess = useCallback(async (): Promise<ReassessOutcome> => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setPending(true);
    setError(null);

    try {
      const data = await api<ReassessResponse>(`/api/symbols/${encodeURIComponent(symbol)}/reassess`, {
        method: "POST",
        signal: controller.signal,
      });
      return { ok: true, data };
    } catch (caught: unknown) {
      const aborted = isAbortError(caught);
      const message = aborted ? "请求已取消" : errorMessage(caught);
      if (mountedRef.current && controllerRef.current === controller && !aborted) setError(message);
      return { ok: false, error: message, aborted };
    } finally {
      if (mountedRef.current && controllerRef.current === controller) {
        controllerRef.current = null;
        setPending(false);
      }
    }
  }, [symbol]);

  return { pending, error, reassess };
}
