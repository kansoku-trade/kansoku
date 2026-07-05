import { useState } from "react";
import type { OverviewRecap, PredictionStats, StatsBucket } from "../../../../shared/types";
import { formatMarketClock } from "../../../../shared/time";
import { signed, upDown } from "../../format";
import { useIntervalFetch } from "../cockpit/useIntervalFetch";

const DIRECTION_LABEL: Record<string, string> = { long: "做多", short: "做空", neutral: "观望" };
const OUTCOME_LABEL: Record<string, string> = { hit_target: "命中目标", hit_stop: "打到止损", open: "未了结" };

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

function SettlementTable({ recap }: { recap: OverviewRecap }) {
  if (recap.settlements.length === 0) return <div className="note-block">今天没有跟踪中的标的。</div>;
  return (
    <div className="recap-settlements">
      {recap.settlements.map((s) => (
        <a key={s.symbol} className="recap-settle-row" href={`#/charts/${encodeURIComponent(s.chart_id)}`}>
          <span className="sym">{s.symbol.replace(/\.US$/, "")}</span>
          <span className="dir">{s.direction ? DIRECTION_LABEL[s.direction] : "—"}</span>
          <span className={s.day_pct != null ? upDown(s.day_pct) : ""}>
            {s.day_pct != null ? `${signed(s.day_pct)}%` : "—"}
          </span>
          {s.outcome ? (
            <span className={`outcome-badge ${s.outcome.status}`}>{OUTCOME_LABEL[s.outcome.status]}</span>
          ) : (
            <span className="outcome-badge">无法判定</span>
          )}
        </a>
      ))}
    </div>
  );
}

function AiActivity({ recap }: { recap: OverviewRecap }) {
  const usage = recap.usage;
  return (
    <div className="recap-ai">
      {recap.alerts.length === 0 && <div className="note-block">今天没有 alert 级提醒。</div>}
      {recap.alerts.map((a, i) => (
        <div key={i} className="recap-alert">
          <span className="ts">{formatMarketClock(a.ts)}</span>
          <span className="sym">{a.symbol.replace(/\.US$/, "")}</span>
          <span className="text">{a.text}</span>
        </div>
      ))}
      <div className="stats-line" style={{ marginTop: 8 }}>
        <span className="k">今日 AI 花费</span>
        <span className="v">
          {usage.runs === 0
            ? "还没有记录"
            : `$${usage.cost_total.toFixed(4)} · ${usage.runs} 次运行 · ${usage.total_tokens.toLocaleString()} tokens`}
        </span>
      </div>
    </div>
  );
}

export function RecapBoard({ defaultExpanded }: { defaultExpanded: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const { data: recap, error } = useIntervalFetch<OverviewRecap>(expanded ? "/api/overview/recap" : null, 5 * 60_000);
  const { data: stats } = useIntervalFetch<PredictionStats>(expanded ? "/api/overview/stats" : null, 5 * 60_000);

  return (
    <div className="recap-board">
      <div className="section-title recap-toggle" onClick={() => setExpanded(!expanded)}>
        今日复盘 {expanded ? "▾" : "▸"}
      </div>
      {expanded && (
        <>
          {error && <div className="error-box">{error}</div>}
          {!recap && !error && <div className="note-block">复盘加载中…</div>}
          {recap && (
            <>
              <SettlementTable recap={recap} />
              <div className="section-title" style={{ marginTop: 16 }}>
                预测战绩（全部历史）
              </div>
              <StatsBlock stats={stats} />
              <div className="section-title" style={{ marginTop: 16 }}>
                AI 活动
              </div>
              <AiActivity recap={recap} />
            </>
          )}
        </>
      )}
    </div>
  );
}
