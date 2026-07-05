import { useEffect, useRef, useState } from "react";
import type { ChartDoc } from "../../../../shared/types";
import { usePollingQuery } from "../../apiHooks";
import { useReassessSymbol } from "./useReassessSymbol";

const POLL_MS = 5_000;
const TIMEOUT_MS = 10 * 60_000;

const REASON_TEXT: Record<string, string> = {
  "analyst layer disabled": "AI 分析未配置（服务端缺 analyst 模型）",
  "already running": "已在分析中，稍等片刻",
  "escalation on cooldown": "刚分析过，请稍后再试",
};

export function GenerateAnalysis({ sym, onReady }: { sym: string; onReady: (id: string) => void }) {
  const [running, setRunning] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const startedAtRef = useRef(0);
  const { pending, reassess } = useReassessSymbol(sym);
  const latestUrl = running ? `/api/symbols/${encodeURIComponent(sym)}/latest` : null;
  const { data: latestDoc } = usePollingQuery<ChartDoc>(latestUrl, POLL_MS);

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
    onReady(latestDoc.id);
  }, [latestDoc, onReady]);

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
      <button className="ai-btn" onClick={start} disabled={pending || running}>
        {running && <span className="ai-spin" />}
        {running ? "AI 分析中，完成后自动打开…" : "AI 生成分析"}
      </button>
      {hint && <span className="ai-hint">{hint}</span>}
    </div>
  );
}
