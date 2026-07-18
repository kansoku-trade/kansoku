import { useEffect, useState } from "react";
import { Dot, MarketTime } from "../../ui";
import type { RunningReassessStatus } from "./useAnalystRun";

const PHASE_LABEL: Record<RunningReassessStatus["phase"], string> = {
  preparing: "准备环境",
  researching: "收集资料",
  writing: "写入复盘",
  finalizing: "生成结论",
};

const ORIGIN_LABEL: Record<RunningReassessStatus["origin"], string> = {
  manual: "手动分析",
  escalation: "自动升级分析",
};

export function formatElapsedDuration(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1_000));
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes === 0) return `${seconds} 秒`;
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  if (hours === 0) return `${minutes} 分 ${String(seconds).padStart(2, "0")} 秒`;
  return `${hours} 小时 ${String(minutes).padStart(2, "0")} 分 ${String(seconds).padStart(2, "0")} 秒`;
}

export function AnalysisRunDetails({ status }: { status: RunningReassessStatus }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [status.startedAt]);

  const startedAt = Date.parse(status.startedAt);
  const elapsed = Number.isFinite(startedAt) ? formatElapsedDuration(now - startedAt) : "时间未知";

  return (
    <div className="ai-run-status">
      <div className="ai-run-status-head">
        <span className="ai-run-status-phase">
          <Dot tone="accent" pulse />
          {PHASE_LABEL[status.phase]}
        </span>
        <span className="ai-run-status-elapsed">
          {ORIGIN_LABEL[status.origin]} · 已运行 {elapsed}
        </span>
      </div>
      <div className="ai-run-status-activity" aria-live="polite">
        {status.activity}
      </div>
      <div className="ai-run-status-meta">
        开始于 <MarketTime value={status.startedAt} format="clock" includeZone /> · 最近动作{" "}
        <MarketTime value={status.updatedAt} format="clock" includeZone />
      </div>
    </div>
  );
}
