import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { OverviewRecap, PredictionStats, StatsBucket } from "@kansoku/shared/types";
import { signed } from "@web/format";
import { symbolAnalysisPath } from "@kansoku/shared/chartUrl";
import { marketDate } from "@kansoku/shared/time";
import { client } from "@web/client";
import { Badge, Card, ErrorBox, MarketTime, Num, SectionTitle } from "@web/ui";
import { useIntervalFetch } from "../cockpit/useIntervalFetch";

const DIRECTION_LABEL: Record<string, string> = { long: "做多", short: "做空", neutral: "观望" };
const OUTCOME_LABEL: Record<string, string> = {
  hit_target: "命中目标",
  hit_stop: "打到止损",
  held_range: "守住区间",
  broke_range: "破区间",
  open: "未了结",
};
const OUTCOME_TONE: Record<string, "up" | "down"> = {
  hit_target: "up",
  hit_stop: "down",
  held_range: "up",
  broke_range: "down",
};

function BucketLine({ label, bucket }: { label: string; bucket: StatsBucket }) {
  const ranged = (bucket.held_range ?? 0) + (bucket.broke_range ?? 0);
  const resolved = bucket.hit_target + bucket.hit_stop + ranged;
  return (
    <div className="stats-line">
      <span className="k">{label}</span>
      <span className="v">
        {bucket.total} 次 · 命中率 {bucket.win_rate == null ? "—" : `${(bucket.win_rate * 100).toFixed(0)}%`}
        {resolved > 0 &&
          `（目标 ${bucket.hit_target} / 止损 ${bucket.hit_stop}${ranged > 0 ? ` / 守区间 ${bucket.held_range} / 破区间 ${bucket.broke_range}` : ""}）`}
        {bucket.open > 0 && ` · 未了结 ${bucket.open}`}
        {bucket.avg_pct != null && ` · 了结均值 ${signed(bucket.avg_pct)}%`}
        {bucket.avg_r != null && ` · 平均盈亏 ${signed(bucket.avg_r)}R/笔`}
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
      <BucketLine label="观望" bucket={stats.by_direction.neutral} />
      <BucketLine label="AI 生成" bucket={stats.by_origin.analyst} />
      <BucketLine label="手动分析" bucket={stats.by_origin.manual} />
    </div>
  );
}

function SettlementTable({ recap, emptyLabel }: { recap: OverviewRecap; emptyLabel: string }) {
  if (recap.settlements.length === 0) return <div className="note-block">{emptyLabel}</div>;
  return (
    <div className="recap-settlements">
      {recap.settlements.map((s) => (
        <Card link key={s.symbol} className="recap-row" href={symbolAnalysisPath(s.symbol, s.chart_id)}>
          <span className="sym">{s.symbol.replace(/\.US$/, "")}</span>
          <span className="dir">{s.direction ? DIRECTION_LABEL[s.direction] : "—"}</span>
          {s.day_pct != null ? <Num value={s.day_pct} diff suffix="%" /> : <span>—</span>}
          {s.outcome ? (
            <Badge tone={OUTCOME_TONE[s.outcome.status]}>{OUTCOME_LABEL[s.outcome.status]}</Badge>
          ) : (
            <Badge>无法判定</Badge>
          )}
        </Card>
      ))}
    </div>
  );
}

function AiActivity({ recap, costLabel, emptyLabel }: { recap: OverviewRecap; costLabel: string; emptyLabel: string }) {
  const usage = recap.usage;
  return (
    <div className="recap-ai">
      {recap.alerts.length === 0 && <div className="note-block">{emptyLabel}</div>}
      {recap.alerts.length > 0 && (
        <div className="recap-alerts">
          {recap.alerts.map((a, i) => (
            <div key={i} className="recap-alert">
              <MarketTime className="ts" value={a.ts} format="clock" />
              <span className="sym">{a.symbol.replace(/\.US$/, "")}</span>
              <span className="text">{a.text}</span>
            </div>
          ))}
        </div>
      )}
      <div className="stats-line stats-line--spaced">
        <span className="k">{costLabel}</span>
        <span className="v">
          {usage.runs === 0
            ? "还没有记录"
            : `$${usage.cost_total.toFixed(4)} · ${usage.runs} 次运行 · ${usage.total_tokens.toLocaleString()} tokens`}
        </span>
      </div>
    </div>
  );
}

export function RecapBoard({ date, defaultExpanded }: { date: string; defaultExpanded: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const isToday = date === marketDate();
  const { data: recap, error } = useIntervalFetch<OverviewRecap>(
    expanded ? `overview.recap:${date}` : null,
    () => client.overview.recap({ date }),
    isToday ? 5 * 60_000 : null,
  );
  const { data: stats } = useIntervalFetch<PredictionStats>(
    expanded ? "overview.stats" : null,
    () => client.overview.stats(),
    5 * 60_000,
  );

  const title = isToday ? "今日复盘" : `${date.slice(5)} 复盘`;
  const costLabel = isToday ? "今日 AI 花费" : "当日 AI 花费";
  const emptySettlements = isToday ? "今天没有跟踪中的标的。" : "当天没有跟踪中的标的。";
  const emptyAlerts = isToday ? "今天没有 alert 级提醒。" : "当天没有 alert 级提醒。";

  return (
    <div className="recap-board">
      <SectionTitle className="recap-toggle" onClick={() => setExpanded(!expanded)}>
        {title} {expanded ? <ChevronDown className="icon" size={13} /> : <ChevronRight className="icon" size={13} />}
      </SectionTitle>
      {expanded && (
        <>
          {error && <ErrorBox>{error}</ErrorBox>}
          {!recap && !error && <div className="note-block">复盘加载中…</div>}
          {recap && (
            <>
              <SettlementTable recap={recap} emptyLabel={emptySettlements} />
              <SectionTitle className="recap-subhead">预测战绩（全部历史）</SectionTitle>
              <StatsBlock stats={stats} />
              <SectionTitle className="recap-subhead">AI 活动</SectionTitle>
              <AiActivity recap={recap} costLabel={costLabel} emptyLabel={emptyAlerts} />
            </>
          )}
        </>
      )}
    </div>
  );
}
