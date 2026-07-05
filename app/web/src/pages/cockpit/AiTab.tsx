import { useEffect, useMemo, useRef, useState } from "react";
import type { CockpitComment } from "../../../../shared/types";
import { formatMarketClock } from "../../../../shared/time";
import { buildFeed } from "./aiFeed";
import { useReassessSymbol } from "./useReassessSymbol";

const LEVEL_LABEL: Record<string, string> = { info: "info", warn: "warn", alert: "alert", error: "error" };
const SOURCE_LABEL: Record<string, string> = { analyst: "分析员", system: "系统" };
const RUN_TIMEOUT_MS = 10 * 60 * 1000;

function CommentItem({ comment }: { comment: CockpitComment }) {
  const dim = comment.source === "commentator" && comment.level === "info";
  const meta: React.ReactNode[] = [];
  if (comment.trigger) meta.push(<span key="trigger">触发：{comment.trigger}</span>);
  if (comment.escalated) meta.push(<span key="escalated">已升级重估</span>);
  if (comment.chartId)
    meta.push(
      <a key="chart" href={`#/charts/${encodeURIComponent(comment.chartId)}`}>
        查看图表
      </a>,
    );
  if (SOURCE_LABEL[comment.source]) meta.push(<span key="source">{SOURCE_LABEL[comment.source]}</span>);

  return (
    <div className={`ai-item${dim ? " dim" : ""}`}>
      <span className="t">{formatMarketClock(comment.ts)}</span>
      <div className="body">
        <p>
          <span className={`ai-lv ${comment.level}`}>{LEVEL_LABEL[comment.level] ?? comment.level}</span>
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
}: {
  symbol: string;
  comments: CockpitComment[];
  error: string | null;
}) {
  const [running, setRunning] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const startedAtRef = useRef(0);
  const { pending, reassess } = useReassessSymbol(symbol);

  useEffect(() => {
    if (!running) return;
    const t = window.setTimeout(() => setRunning(false), RUN_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [running]);

  useEffect(() => {
    if (!running) return;
    const done = comments.some(
      (c) => (c.source === "analyst" || c.source === "system") && Date.parse(c.ts) >= startedAtRef.current,
    );
    if (done) setRunning(false);
  }, [comments, running]);

  const runReassess = async () => {
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
      setHint("已在运行");
      window.setTimeout(() => setHint(null), 3000);
    }
  };

  const rows = useMemo(() => buildFeed(comments).reverse(), [comments]);

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
      <div className="ai-reassess">
        <button className="ai-btn" onClick={runReassess} disabled={pending || running}>
          {running && <span className="ai-spin" />}
          {running ? "重估进行中…" : "重新分析"}
        </button>
        {hint && <span className="ai-hint">{hint}</span>}
      </div>

      {error ? (
        <div className="note-block">点评获取失败：{error}</div>
      ) : rows.length === 0 ? (
        <div className="note-block">今天还没有 AI 点评</div>
      ) : (
        <div className="ai-feed">
          {rows.map((row) =>
            row.kind === "comment" ? (
              <CommentItem key={`${row.comment.ts}-${row.comment.text}`} comment={row.comment} />
            ) : expanded.has(row.id) ? (
              <div key={row.id}>
                <div className="ai-fold open" onClick={() => toggleFold(row.id)}>
                  {formatMarketClock(row.from)} – {formatMarketClock(row.to)} 无事 ×{row.count}（收起）
                </div>
                {[...row.comments].reverse().map((c) => (
                  <CommentItem key={`${c.ts}-${c.text}`} comment={c} />
                ))}
              </div>
            ) : (
              <div key={row.id} className="ai-fold" onClick={() => toggleFold(row.id)}>
                {formatMarketClock(row.from)} – {formatMarketClock(row.to)} 无事 ×{row.count}（点击展开）
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
