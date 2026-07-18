import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@web/api";
import { client } from "@web/client";

export const REASON_TEXT: Record<string, string> = {
  "analyst layer disabled": "AI 分析未配置（服务端缺 analyst 模型）",
  "already running": "已在分析中，稍等片刻",
  "escalation on cooldown": "刚分析过，请稍后再试",
};

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
  const tokenRef = useRef<object | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      tokenRef.current = null;
    };
  }, []);

  useEffect(() => {
    tokenRef.current = null;
    setPending(false);
    setError(null);
  }, [symbol]);

  const reassess = useCallback(async (): Promise<ReassessOutcome> => {
    const token = {};
    tokenRef.current = token;
    setPending(true);
    setError(null);

    try {
      const data = await client.symbols.reassess({ sym: symbol });
      const superseded = tokenRef.current !== token;
      if (superseded) return { ok: false, error: "请求已取消", aborted: true };
      return { ok: true, data };
    } catch (caught: unknown) {
      const superseded = tokenRef.current !== token;
      const message = superseded ? "请求已取消" : errorMessage(caught);
      if (mountedRef.current && !superseded) setError(message);
      return { ok: false, error: message, aborted: superseded };
    } finally {
      if (mountedRef.current && tokenRef.current === token) {
        tokenRef.current = null;
        setPending(false);
      }
    }
  }, [symbol]);

  return { pending, error, reassess };
}
