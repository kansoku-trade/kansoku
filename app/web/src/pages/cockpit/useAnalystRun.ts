import { useCallback, useEffect, useRef, useState } from "react";
import type { ReassessStatus } from "../../../../packages/core/src/contract/symbols.js";
import { useAnalystRuns } from "../../analystRunsStore.js";
import { client } from "../../client";
import { REASON_TEXT, useReassessSymbol } from "./useReassessSymbol";

export type RunningReassessStatus = Extract<ReassessStatus, { running: true }>;

export const RECONCILE_WINDOW_MS = 10_000;

export interface AnalystRunController {
  checking: boolean;
  hint: string | null;
  pending: boolean;
  running: boolean;
  start: () => Promise<void>;
  status: RunningReassessStatus | null;
}

export function useAnalystRun(symbol: string, enabled = true): AnalystRunController {
  const [optimisticStartedAt, setOptimisticStartedAt] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const { pending, reassess } = useReassessSymbol(symbol);
  const { runs } = useAnalystRuns();
  const serverStatus = enabled ? (runs.get(symbol) ?? null) : null;
  const reconcileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearReconcileTimer = useCallback(() => {
    if (reconcileTimerRef.current === null) return;
    clearTimeout(reconcileTimerRef.current);
    reconcileTimerRef.current = null;
  }, []);

  const armReconcileTimer = useCallback(
    (sym: string) => {
      clearReconcileTimer();
      reconcileTimerRef.current = setTimeout(async () => {
        reconcileTimerRef.current = null;
        let stillRunning = false;
        try {
          stillRunning = (await client.symbols.reassessStatus({ sym })).running;
        } catch {
          stillRunning = false;
        }
        if (stillRunning) {
          armReconcileTimer(sym);
        } else {
          setOptimisticStartedAt(null);
        }
      }, RECONCILE_WINDOW_MS);
    },
    [clearReconcileTimer],
  );

  useEffect(() => {
    setOptimisticStartedAt(null);
    setHint(null);
    return clearReconcileTimer;
  }, [symbol, enabled, clearReconcileTimer]);

  useEffect(() => {
    if (!serverStatus?.running) return;
    setOptimisticStartedAt(null);
    setHint(null);
    clearReconcileTimer();
  }, [serverStatus, clearReconcileTimer]);

  const start = useCallback(async () => {
    setHint(null);
    const result = await reassess();
    if (!result.ok) {
      if (!result.aborted) setHint(result.error);
      return;
    }

    if (result.data.started || result.data.reason === "already running") {
      setOptimisticStartedAt(Date.now());
      armReconcileTimer(symbol);
      return;
    }

    const reason = result.data.reason ?? "";
    setHint(REASON_TEXT[reason] ?? (reason || "未能启动分析"));
  }, [reassess, armReconcileTimer, symbol]);

  let status: RunningReassessStatus | null = serverStatus?.running ? serverStatus : null;
  if (!status && optimisticStartedAt !== null) {
    const startedAt = new Date(optimisticStartedAt).toISOString();
    status = {
      running: true,
      origin: "manual",
      phase: "preparing",
      activity: "正在等待服务端确认任务",
      startedAt,
      updatedAt: startedAt,
    };
  }

  return {
    checking: false,
    hint,
    pending,
    running: status !== null,
    start,
    status,
  };
}
