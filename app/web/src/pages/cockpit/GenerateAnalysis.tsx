import { useEffect, useRef, useState } from "react";
import type { ChartDoc } from "../../../../shared/types";
import { usePollingQuery } from "../../apiHooks";
import { client } from "../../client";
import { Button, Spinner } from "../../ui";
import { REASON_TEXT, useReassessSymbol } from "./useReassessSymbol";

const POLL_MS = 5_000;
const TIMEOUT_MS = 10 * 60_000;

export function GenerateAnalysis({ sym }: { sym: string }) {
  const [running, setRunning] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const startedAtRef = useRef(0);
  const { pending, reassess } = useReassessSymbol(sym);
  const latestKey = running ? `symbols.latest:${sym}` : null;
  const { data: latestDoc } = usePollingQuery<ChartDoc>(latestKey, () => client.symbols.latest({ sym }), POLL_MS);

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => {
      setRunning(false);
      setHint("等待超时——分析可能失败了，稍后刷新页面看看");
    }, Math.max(0, TIMEOUT_MS - (Date.now() - startedAtRef.current)));
    return () => window.clearTimeout(timer);
  }, [running]);

  useEffect(() => {
    if (!latestDoc) return;
    setRunning(false);
  }, [latestDoc]);

  const start = async () => {
    setHint(null);
    const result = await reassess();
    if (!result.ok) {
      if (!result.aborted) setHint(result.error);
      return;
    }
    if (result.data.started) {
      startedAtRef.current = Date.now();
      setRunning(true);
    } else {
      const reason = result.data.reason ?? "";
      setHint(REASON_TEXT[reason] ?? (reason || "未能启动分析"));
    }
  };

  return (
    <div className="ai-reassess">
      <Button onClick={start} disabled={pending || running}>
        {running && <Spinner />}
        {running ? "AI 分析中，完成后自动打开…" : "AI 生成分析"}
      </Button>
      {hint && <span className="ai-hint">{hint}</span>}
    </div>
  );
}
