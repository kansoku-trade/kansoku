import type { AiUsageSummary, OverviewBoard, OverviewRow, PredictionStats, StatsBucket } from "../../../shared/types";
import { formatMarketClock } from "../../../shared/time";
import { fmt, signed, upDown } from "../format";
import { QuoteBar } from "../QuoteBar";
import { useIntervalFetch } from "./cockpit/useIntervalFetch";

const DIRECTION_LABEL: Record<string, string> = { long: "做多", short: "做空", neutral: "观望" };

function pctCell(value: number | null): string {
  return value == null ? "—" : `${signed(value)}%`;
}

function BucketLine({ label, bucket }: { label: string; bucket: StatsBucket }) {
  const resolved = bucket.hit_target + bucket.hit_stop;
  return (
    <div className="stats-line">
      <span className="k">{label}</span>
      <span className="v">
        {bucket.total} 次 · 命中率 {bucket.win_rate == null ? "—" : `${(bucket.win_rate * 100).toFixed(0)}%`}
        {resolved > 0 && `（目标 ${bucket.hit_target} / 止损 ${bucket.hit_stop}）`}
        {bucket.open > 0 && ` · 未了结 ${bucket.open}`}
        {bucket.avg_pct != null && ` · 了结均值 ${signed(bucket.avg_pct)}%`}
      </span>
    </div>
  );
}

function StatsBlock({ stats }: { stats: PredictionStats | null }) {
  if (!stats) return <div className="note-block">统计加载中…</div>;
  if (stats.total === 0) return <div className="note-block">还没有可统计的预测。</div>;
  return (
    <div className="overview-stats">
      <BucketLine label="全部预测" bucket={stats.overall} />
      <BucketLine label="做多" bucket={stats.by_direction.long} />
      <BucketLine label="做空" bucket={stats.by_direction.short} />
      <BucketLine label="AI 生成" bucket={stats.by_origin.analyst} />
      <BucketLine label="手动分析" bucket={stats.by_origin.manual} />
    </div>
  );
}

function UsageBlock({ usage }: { usage: AiUsageSummary | null }) {
  if (!usage) return <div className="note-block">花费加载中…</div>;
  if (usage.runs === 0) return <div className="note-block">今天还没有 AI 花费记录。</div>;
  const layers = Object.entries(usage.by_layer)
    .map(([layer, s]) => `${layer} $${s.cost_total.toFixed(4)}`)
    .join(" · ");
  return (
    <div className="stats-line">
      <span className="k">今日 AI 花费</span>
      <span className="v">
        ${usage.cost_total.toFixed(4)} · {usage.runs} 次运行 · {usage.total_tokens.toLocaleString()} tokens
        {layers && `（${layers}）`}
      </span>
    </div>
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
      </div>
      {comment && (
        <div className={`overview-card-comment ${comment.level}`}>
          {formatMarketClock(comment.ts)} · {comment.text}
        </div>
      )}
    </a>
  );
}

export function Overview() {
  const { data: board, error } = useIntervalFetch<OverviewBoard>("/api/overview", 30_000);
  const { data: stats } = useIntervalFetch<PredictionStats>("/api/overview/stats", 5 * 60_000);
  const { data: usage } = useIntervalFetch<AiUsageSummary>("/api/overview/usage", 60_000);

  return (
    <div className="page">
      <h1>盘中总览</h1>
      <div className="sub">今天跟踪中的 intraday 标的 · 30 秒自动刷新 · {board?.date ?? ""}</div>
      <QuoteBar />
      {error && <div className="error-box">{error}</div>}
      {board && board.rows.length === 0 && (
        <div className="empty">今天还没有 intraday 分析——去 cockpit 或跑一次 intraday-signal</div>
      )}
      <div className="overview-grid">
        {board?.rows.map((row) => (
          <SymbolCard key={row.symbol} row={row} />
        ))}
      </div>
      <div className="section-title" style={{ marginTop: 28 }}>
        预测战绩（全部历史）
      </div>
      <StatsBlock stats={stats} />
      <div className="section-title" style={{ marginTop: 20 }}>
        AI 花费
      </div>
      <UsageBlock usage={usage} />
      <p style={{ marginTop: 24 }}>
        <a href="#/">← 图表列表</a>
      </p>
    </div>
  );
}
