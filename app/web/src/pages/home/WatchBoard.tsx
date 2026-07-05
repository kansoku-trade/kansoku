import { useState } from "react";
import type { OverviewBoard, OverviewRow } from "../../../../shared/types";
import { formatMarketClock } from "../../../../shared/time";
import { api, errorMessage } from "../../api";
import { fmt, signed, upDown } from "../../format";

const DIRECTION_LABEL: Record<string, string> = { long: "做多", short: "做空", neutral: "观望" };

function pctCell(value: number | null): string {
  return value == null ? "—" : `${signed(value)}%`;
}

function ReassessButton({ symbol }: { symbol: string }) {
  const [state, setState] = useState<"idle" | "running" | "done" | "failed">("idle");

  const run = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (state === "running") return;
    setState("running");
    try {
      const res = await api<{ started: boolean; reason?: string }>(
        `/api/symbols/${encodeURIComponent(symbol)}/reassess`,
        { method: "POST" },
      );
      setState(res.started ? "done" : "failed");
    } catch (err) {
      console.warn(`reassess ${symbol}: ${errorMessage(err)}`);
      setState("failed");
    }
    window.setTimeout(() => setState("idle"), 4000);
  };

  const label =
    state === "running" ? "分析中…" : state === "done" ? "已触发 ✓" : state === "failed" ? "未启动" : "重新分析";
  return (
    <button type="button" className={`reassess-btn ${state}`} onClick={run} disabled={state === "running"}>
      {label}
    </button>
  );
}

function SymbolCard({ row }: { row: OverviewRow }) {
  const comment = row.latest_comment;
  return (
    <a className="overview-card" href={`#/symbol/${encodeURIComponent(row.symbol)}`}>
      <div className="overview-card-head">
        <span className="sym">{row.symbol}</span>
        {row.direction && <span className={`dir-badge ${row.direction}`}>{DIRECTION_LABEL[row.direction]}</span>}
        {row.last != null && (
          <span className={`quote ${row.pct != null ? upDown(row.pct) : ""}`}>
            {fmt(row.last)}
            {row.pct != null && ` ${signed(row.pct)}%`}
          </span>
        )}
        {row.prediction_stale && <span className="stale-dot" title="预测已过期" />}
        {row.alert_count > 0 && <span className="ai-unread">{row.alert_count}</span>}
      </div>
      <div className="overview-card-levels">
        <span>止损 {pctCell(row.stop_distance_pct)}</span>
        <span>目标1 {pctCell(row.target1_distance_pct)}</span>
        {row.entry != null && <span>入场 {fmt(row.entry)}</span>}
        <ReassessButton symbol={row.symbol} />
      </div>
      {comment && (
        <div className={`overview-card-comment ${comment.level}`}>
          {formatMarketClock(comment.ts)} · {comment.text}
        </div>
      )}
    </a>
  );
}

export function WatchBoard({
  board,
  error,
  compact,
}: {
  board: OverviewBoard | null;
  error: string | null;
  compact: boolean;
}) {
  if (error) return <div className="error-box">{error}</div>;
  if (!board) return <div className="note-block">看盘数据加载中…</div>;
  if (board.rows.length === 0) {
    return <div className="empty">今天还没有 intraday 分析——去 cockpit 或跑一次 intraday-signal</div>;
  }
  if (compact) {
    return (
      <div className="watch-strip">
        {board.rows.map((row) => (
          <a key={row.symbol} className="watch-strip-item" href={`#/symbol/${encodeURIComponent(row.symbol)}`}>
            <span className="sym">{row.symbol.replace(/\.US$/, "")}</span>
            {row.direction && <span className={`dir-badge ${row.direction}`}>{DIRECTION_LABEL[row.direction]}</span>}
            {row.pct != null && <span className={upDown(row.pct)}>{signed(row.pct)}%</span>}
          </a>
        ))}
      </div>
    );
  }
  return (
    <div className="overview-grid">
      {board.rows.map((row) => (
        <SymbolCard key={row.symbol} row={row} />
      ))}
    </div>
  );
}
