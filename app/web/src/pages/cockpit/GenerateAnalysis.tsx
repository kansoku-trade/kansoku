import { useEffect, useState } from "react";
import type { ReassessStatus } from "../../../../packages/core/src/contract/symbols.js";
import type { ChartDoc } from "../../../../shared/types";
import { usePollingQuery } from "../../apiHooks";
import { client } from "../../client";
import { Button, Spinner } from "../../ui";
import { REASON_TEXT, useReassessSymbol } from "./useReassessSymbol";

const POLL_MS = 5_000;

export function GenerateAnalysis({ sym }: { sym: string }) {
  const [optimisticStartedAt, setOptimisticStartedAt] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const { pending, reassess } = useReassessSymbol(sym);
  const statusKey = `symbols.reassessStatus:${sym}`;
  const { data: status, loading: statusLoading, reload: reloadStatus } = usePollingQuery<ReassessStatus>(
    statusKey,
    () => client.symbols.reassessStatus({ sym }),
    POLL_MS,
    { cache: false },
  );
  const running = Boolean(status?.running || optimisticStartedAt);
  const latestKey = running ? `symbols.latest:${sym}` : null;
  const { data: latestDoc } = usePollingQuery<ChartDoc>(latestKey, () => client.symbols.latest({ sym }), POLL_MS);

  useEffect(() => {
    setOptimisticStartedAt(null);
    setHint(null);
  }, [sym]);

  useEffect(() => {
    if (!status) return;
    setOptimisticStartedAt(null);
  }, [status]);

  useEffect(() => {
    if (!latestDoc) return;
    setOptimisticStartedAt(null);
  }, [latestDoc]);

  const start = async () => {
    setHint(null);
    const result = await reassess();
    if (!result.ok) {
      if (!result.aborted) setHint(result.error);
      return;
    }
    if (result.data.started) {
      setOptimisticStartedAt(Date.now());
      reloadStatus();
    } else {
      const reason = result.data.reason ?? "";
      if (reason === "already running") {
        setOptimisticStartedAt(Date.now());
        reloadStatus();
      } else {
        setHint(REASON_TEXT[reason] ?? (reason || "未能启动分析"));
      }
    }
  };

  const checking = statusLoading && !status && !optimisticStartedAt;

  return (
    <div className="ai-reassess">
      <Button onClick={start} disabled={pending || running || checking}>
        {(running || checking) && <Spinner />}
        {checking ? "正在确认分析状态…" : running ? "AI 分析中，完成后自动打开…" : "AI 生成分析"}
      </Button>
      {hint && <span className="ai-hint">{hint}</span>}
    </div>
  );
}
