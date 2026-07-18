import { useEffect, useMemo, useRef, useState } from "react";
import type { CockpitComment } from "@kansoku/shared/types";
import { marketDate } from "@kansoku/shared/time";
import { useQuery } from "@web/apiHooks";
import { client } from "@web/client";
import { marketOfSymbol } from "@web/lib/market";
import { Badge, Button, MarketTime, Select, Spinner } from "@web/ui";
import { AnalysisRunDetails } from "./AnalysisRunDetails";
import { buildFeed, type FeedRow } from "./aiFeed";
import { FollowAction } from "./FollowAction";
import { symbolUrl } from "./analysisMode";
import { useAnalystRun } from "./useAnalystRun";

const LEVEL_LABEL: Record<string, string> = { info: "info", warn: "warn", alert: "alert", error: "error" };
const LEVEL_TONE: Record<string, "up" | "down" | "accent" | "solid" | undefined> = {
  info: undefined,
  warn: "accent",
  alert: "down",
  error: "solid",
};
const SOURCE_LABEL: Record<string, string> = { analyst: "分析员", system: "系统" };

function CommentItem({ symbol, comment }: { symbol: string; comment: CockpitComment }) {
  const market = marketOfSymbol(symbol);
  const dim = comment.source === "commentator" && comment.level === "info";
  const meta: React.ReactNode[] = [];
  if (comment.trigger) meta.push(<span key="trigger">触发：{comment.trigger}</span>);
  if (comment.escalated) meta.push(<span key="escalated">已升级重估</span>);
  if (comment.chartId)
    meta.push(
      <a key="chart" href={symbolUrl(symbol, comment.chartId)}>
        查看图表
      </a>,
    );
  if (SOURCE_LABEL[comment.source]) meta.push(<span key="source">{SOURCE_LABEL[comment.source]}</span>);

  return (
    <div className={`ai-item${dim ? " dim" : ""}`}>
      <MarketTime className="t" value={comment.ts} format="clock" market={market} />
      <div className="body">
        <p>
          <Badge tone={LEVEL_TONE[comment.level]} className="level-badge">
            {LEVEL_LABEL[comment.level] ?? comment.level}
          </Badge>
          {comment.text}
        </p>
        {meta.length > 0 && (
          <div className="ai-meta">
            {meta.map((m, i) => (
              <span key={i}>
                {i > 0 && <span className="sep"> · </span>}
                {m}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function AiTab({
  symbol,
  comments,
  error,
  readOnly = false,
  loaded = true,
  analysisRevision,
}: {
  symbol: string;
  comments: CockpitComment[];
  error: string | null;
  readOnly?: boolean;
  loaded?: boolean;
  analysisRevision?: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const run = useAnalystRun(symbol, !readOnly);

  const today = marketDate();
  const { data: dates } = useQuery<string[]>(
    readOnly ? null : `symbols.commentDates:${symbol}`,
    () => client.symbols.commentDates({ sym: symbol }),
  );
  const pastDates = useMemo(() => (dates ?? []).filter((d) => d < today), [dates, today]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const autoFellBack = useRef(false);
  useEffect(() => {
    setSelectedDate(null);
    autoFellBack.current = false;
  }, [symbol]);
  useEffect(() => {
    if (readOnly || autoFellBack.current || selectedDate !== null) return;
    if (loaded && comments.length === 0 && pastDates.length > 0) {
      autoFellBack.current = true;
      setSelectedDate(pastDates[0]);
    }
  }, [readOnly, loaded, comments.length, pastDates, selectedDate]);
  const { data: pastComments, error: pastError } = useQuery<CockpitComment[]>(
    selectedDate ? `symbols.comments:${symbol}:${selectedDate}` : null,
    () => client.symbols.comments({ sym: symbol, date: selectedDate! }),
  );
  const shownComments = selectedDate ? (pastComments ?? []) : comments;
  const shownError = selectedDate ? pastError : error;

  const rows = useMemo(() => buildFeed(shownComments).reverse(), [shownComments]);
  const market = marketOfSymbol(symbol);

  const toggleFold = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="ai-tab">
      {!readOnly && (
        <div className="ai-run-control">
          <div className="ai-reassess">
            <Button onClick={run.start} disabled={run.pending || run.running}>
              {run.running && <Spinner />}
              {run.running ? "重估进行中…" : "重新分析"}
            </Button>
            {run.hint && <span className="ai-hint">{run.hint}</span>}
            {analysisRevision && <FollowAction symbol={symbol} revision={analysisRevision} />}
            {pastDates.length > 0 && (
              <Select
                className="ai-date-select"
                value={selectedDate ?? "today"}
                options={[{ value: "today", label: "今天" }, ...pastDates.map((d) => ({ value: d, label: d }))]}
                onChange={(v) => setSelectedDate(v === "today" ? null : v)}
              />
            )}
          </div>
          {run.status && <AnalysisRunDetails status={run.status} />}
        </div>
      )}

      {selectedDate && <div className="note-block">显示 {selectedDate} 的点评（今天暂无新点评）</div>}

      {renderFeed()}
    </div>
  );

  function renderRow(row: FeedRow) {
    if (row.kind === "comment") {
      return <CommentItem key={`${row.comment.ts}-${row.comment.text}`} symbol={symbol} comment={row.comment} />;
    }
    if (!expanded.has(row.id)) {
      return (
        <div key={row.id} className="ai-fold" onClick={() => toggleFold(row.id)}>
          <MarketTime value={row.from} format="clock" market={market} /> – <MarketTime value={row.to} format="clock" market={market} /> 无事 ×{row.count}（点击展开）
        </div>
      );
    }
    return (
      <div key={row.id}>
        <div className="ai-fold open" onClick={() => toggleFold(row.id)}>
          <MarketTime value={row.from} format="clock" market={market} /> – <MarketTime value={row.to} format="clock" market={market} /> 无事 ×{row.count}（收起）
        </div>
        {[...row.comments].reverse().map((c) => (
          <CommentItem key={`${c.ts}-${c.text}`} symbol={symbol} comment={c} />
        ))}
      </div>
    );
  }

  function renderFeed() {
    if (shownError) return <div className="note-block">点评获取失败：{shownError}</div>;
    if (rows.length === 0) {
      return (
        <div className="note-block">
          {selectedDate ? `${selectedDate} 没有点评` : "还没有 AI 点评——点评由盘中自动监控（触发信号 / 定时心跳）产生；也可以点上面「重新分析」手动跑一次重估"}
        </div>
      );
    }
    return <div className="ai-feed">{rows.map(renderRow)}</div>;
  }
}
