import { useState } from "react";
import type { OverviewBoard, OverviewRow } from "../../../../shared/types";
import { formatMarketClock } from "../../../../shared/time";
import { api, errorMessage } from "../../api";
import { fmt, signed } from "../../format";
import { Badge, Button, Card, Dot, Empty, ErrorBox, Num } from "../../ui";

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
  const btnState = state === "running" ? "busy" : state === "idle" ? undefined : state;
  return (
    <Button className="reassess-action" state={btnState} onClick={run} disabled={state === "running"}>
      {label}
    </Button>
  );
}

function SymbolCard({ row }: { row: OverviewRow }) {
  const comment = row.latest_comment;
  return (
    <Card link className="symbol-card" href={`#/symbol/${encodeURIComponent(row.symbol)}`}>
      <div className="symbol-card-head">
        <span className="sym">{row.symbol}</span>
        {row.direction && (
          <Badge tone={row.direction === "long" ? "up" : row.direction === "short" ? "down" : undefined}>
            {DIRECTION_LABEL[row.direction]}
          </Badge>
        )}
        {row.last != null && (
          <span className="quote">
            {fmt(row.last)}
            {row.pct != null && <Num value={row.pct} diff suffix="%" />}
          </span>
        )}
        {row.prediction_stale && <Dot tone="accent" title="预测已过期" />}
        {row.alert_count > 0 && <Badge tone="down" className="unread-badge">{row.alert_count}</Badge>}
      </div>
      <div className="symbol-card-levels">
        <span>止损 {pctCell(row.stop_distance_pct)}</span>
        <span>目标1 {pctCell(row.target1_distance_pct)}</span>
        {row.entry != null && <span>入场 {fmt(row.entry)}</span>}
        <ReassessButton symbol={row.symbol} />
      </div>
      {comment && (
        <div className={`symbol-card-comment ${comment.level}`}>
          {formatMarketClock(comment.ts)} · {comment.text}
        </div>
      )}
    </Card>
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
  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!board) return <div className="note-block">看盘数据加载中…</div>;
  if (board.rows.length === 0) {
    return <Empty>今天还没有 intraday 分析——去 cockpit 或跑一次 intraday-signal</Empty>;
  }
  if (compact) {
    return (
      <div className="watch-strip">
        {board.rows.map((row) => (
          <Card link className="watch-strip-cell" key={row.symbol} href={`#/symbol/${encodeURIComponent(row.symbol)}`}>
            <span className="sym">{row.symbol.replace(/\.US$/, "")}</span>
            {row.direction && (
              <Badge tone={row.direction === "long" ? "up" : row.direction === "short" ? "down" : undefined}>
                {DIRECTION_LABEL[row.direction]}
              </Badge>
            )}
            {row.pct != null && <Num value={row.pct} diff suffix="%" />}
          </Card>
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
