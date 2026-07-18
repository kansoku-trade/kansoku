import { useState } from "react";
import { Check, Lock, RadioTower } from "lucide-react";
import type { OverviewBoard, OverviewRow } from "../../../../../packages/shared/types";
import { errorMessage } from "../../api";
import { client } from "../../client";
import { fmt, signed } from "../../format";
import { Badge, Button, Card, Dot, Empty, ErrorBox, MarketTime, Num, Switch } from "../../ui";
import { useFeature } from "../../useFeature";
import { useSymbolFollow } from "../../useSymbolFollow";
import { directionTone } from "../../charts/intraday/directionLabels";

const DIRECTION_LABEL: Record<string, string> = { long: "做多", short: "做空", neutral: "观望" };

function pctCell(value: number | null): string {
  return value == null ? "—" : `${signed(value)}%`;
}

function FollowToggle({
  symbol,
  initialFollowing,
  compact = false,
}: {
  symbol: string;
  initialFollowing: boolean;
  compact?: boolean;
}) {
  const { state, guard } = useFeature("symbol-follow");
  const { following, busy, statusError, change } = useSymbolFollow({ symbol, initialFollowing });
  const active = following ?? initialFollowing;
  if (state === "absent") return null;
  const locked = state === "locked";
  const className = [
    "symbol-card-follow",
    active && "symbol-card-follow--active",
    statusError && "symbol-card-follow--error",
    locked && "symbol-card-follow--locked",
    compact && "symbol-card-follow--compact",
  ]
    .filter(Boolean)
    .join(" ");

  const onControlClick = (event: React.MouseEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if ((event.target as Element).closest(".ui-switch") || busy) return;
    const next = !active;
    if (locked && next) {
      guard(() => {});
      return;
    }
    void change(next);
  };

  return (
    <span
      className={className}
      title={
        locked
          ? "AI 跟进需要有效授权，点击开关订阅解锁"
          : statusError ?? (active ? "AI 评论员正在后台持续跟进" : "AI 评论员未在后台跟进")
      }
      onClick={onControlClick}
    >
      <RadioTower aria-hidden="true" size={compact ? 12 : 11} />
      <span className={compact ? "sr-only" : undefined}>AI 跟进</span>
      {locked && <Lock className="follow-control-lock" size={compact ? 12 : 11} />}
      <Switch
        ariaLabel={`持续跟进 ${symbol} 的 AI 点评`}
        checked={active}
        disabled={busy}
        onCheckedChange={(checked) => {
          if (locked && checked) {
            guard(() => {});
            return;
          }
          void change(checked);
        }}
      />
    </span>
  );
}

function ReassessButton({ symbol }: { symbol: string }) {
  const [state, setState] = useState<"idle" | "running" | "done" | "failed">("idle");

  const run = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (state === "running") return;
    setState("running");
    try {
      const res = await client.symbols.reassess({ sym: symbol });
      setState(res.started ? "done" : "failed");
    } catch (err) {
      console.warn(`reassess ${symbol}: ${errorMessage(err)}`);
      setState("failed");
    }
    window.setTimeout(() => setState("idle"), 4000);
  };

  const labels: Record<typeof state, React.ReactNode> = {
    idle: "重新分析",
    running: "分析中…",
    done: (
      <>
        已触发 <Check className="icon" size={13} />
      </>
    ),
    failed: "未启动",
  };
  const label = labels[state];
  const btnStates: Record<typeof state, "busy" | "done" | "failed" | undefined> = {
    idle: undefined,
    running: "busy",
    done: "done",
    failed: "failed",
  };
  const btnState = btnStates[state];
  return (
    <Button className="reassess-action" state={btnState} onClick={run} disabled={state === "running"}>
      {label}
    </Button>
  );
}

function SymbolCard({ row }: { row: OverviewRow }) {
  const comment = row.latest_comment;
  return (
    <Card link className="symbol-card" href={`/symbol/${encodeURIComponent(row.symbol)}`}>
      <div className="symbol-card-head">
        <span className="sym">{row.symbol}</span>
        {row.direction && (
          <Badge tone={directionTone(row.direction)}>
            {DIRECTION_LABEL[row.direction]}
          </Badge>
        )}
        {row.last != null && (
          <span className="quote">
            {fmt(row.last)}
            {row.pct != null && <>{" "}<Num value={row.pct} diff suffix="%" /></>}
          </span>
        )}
        <FollowToggle symbol={row.symbol} initialFollowing={row.ai_following} />
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
          <MarketTime value={comment.ts} format="clock" /> · {comment.text}
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
          <Card link className="watch-strip-cell" key={row.symbol} href={`/symbol/${encodeURIComponent(row.symbol)}`}>
            <span className="sym">{row.symbol.replace(/\.US$/, "")}</span>
            {row.direction && (
              <Badge tone={directionTone(row.direction)}>
                {DIRECTION_LABEL[row.direction]}
              </Badge>
            )}
            {row.pct != null && <Num value={row.pct} diff suffix="%" />}
            <FollowToggle symbol={row.symbol} initialFollowing={row.ai_following} compact />
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
