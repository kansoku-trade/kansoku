import { useCallback, useEffect, useRef, useState } from "react";
import {
  getAnalystRunStatus,
  getLatestAnalystRunEvent,
  type RunningReassessStatus,
  useAnalystRunStatus,
} from "../../analystRunsStore.js";
import { client } from "../../client";
import { REASON_TEXT, useReassessSymbol } from "./useReassessSymbol";

export type { RunningReassessStatus };

const RECONCILE_WINDOW_MS = 10_000;

export interface AnalystRunController {
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
  const serverStatus = useAnalystRunStatus(symbol, enabled);
  const serverRunning = serverStatus !== null;
  const reconcileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconcileGenerationRef = useRef(0);

  const clearReconcileTimer = useCallback(() => {
    reconcileGenerationRef.current += 1;
    if (reconcileTimerRef.current === null) return;
    clearTimeout(reconcileTimerRef.current);
    reconcileTimerRef.current = null;
  }, []);

  const armReconcileTimer = useCallback(
    (sym: string) => {
      clearReconcileTimer();
      const generation = reconcileGenerationRef.current;
      reconcileTimerRef.current = setTimeout(async () => {
        reconcileTimerRef.current = null;
        let stillRunning = false;
        try {
          stillRunning = (await client.symbols.reassessStatus({ sym })).running;
        } catch {
          stillRunning = false;
        }
        if (generation !== reconcileGenerationRef.current) return;
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
    if (!serverRunning) return;
    setOptimisticStartedAt(null);
    setHint(null);
    clearReconcileTimer();
  }, [serverRunning, clearReconcileTimer]);

  const start = useCallback(async () => {
    const eventBeforeStart = getLatestAnalystRunEvent(symbol);
    setHint(null);
    const result = await reassess();
    if (!result.ok) {
      if (!result.aborted) setHint(result.error);
      return;
    }

    if (result.data.started || result.data.reason === "already running") {
      const eventAfterStart = getLatestAnalystRunEvent(symbol);
      const observedTerminalDuringStart =
        eventAfterStart !== null &&
        eventAfterStart.revision !== eventBeforeStart?.revision &&
        !eventAfterStart.running;
      if (getAnalystRunStatus(symbol) !== null || observedTerminalDuringStart) {
        setOptimisticStartedAt(null);
        clearReconcileTimer();
        return;
      }
      setOptimisticStartedAt(Date.now());
      armReconcileTimer(symbol);
      return;
    }

    const reason = result.data.reason ?? "";
    setHint(REASON_TEXT[reason] ?? (reason || "未能启动分析"));
  }, [reassess, armReconcileTimer, clearReconcileTimer, symbol]);

  let status: RunningReassessStatus | null = serverStatus;
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
    hint,
    pending,
    running: status !== null,
    start,
    status,
  };
}
