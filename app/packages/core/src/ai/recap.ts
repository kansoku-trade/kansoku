import { promises as fs } from "node:fs";
import { join } from "node:path";
import type {
  AiUsageSummary,
  AnalysisOutcome,
  ChartMeta,
  CockpitComment,
  IntradayPrediction,
  RawBar,
} from "../../../../shared/types.js";
import { JOURNAL_DIR } from "../env.js";
import { aggregateStats, type StatsRow } from "../services/cockpit/stats.js";
import { attachRMultiple, judgeOutcome, zoneFromPrediction } from "../services/cockpit/outcome.js";
import { getResolvedOutcomes, saveResolvedOutcome, type OutcomeKey } from "../services/cockpit/outcomeCache.js";
import { getProvider } from "../services/marketdata/registry.js";
import { easternDate } from "../services/session.js";
import { listCharts, loadChart } from "../services/store.js";
import { listComments } from "./comments.js";
import { listUsage, summarizeUsage, type AiUsageRecord } from "./usageStore.js";

const OUTCOME_BARS = 300;

export interface RecapSymbolReport {
  symbol: string;
  direction: "long" | "short" | "neutral" | null;
  origin: "analyst" | "manual";
  entry: number | null;
  stop: number | null;
  target1: number | null;
  zone: { low: number; high: number } | null;
  outcome: AnalysisOutcome | null;
  comments: CockpitComment[];
}

const LEVEL_LABEL: Record<string, string> = { alert: "警报", warn: "提醒", info: "观察", error: "故障" };
const LEVEL_ORDER = ["alert", "warn", "info", "error"] as const;

const clockFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/New_York",
  hour12: false,
  hour: "2-digit",
  minute: "2-digit",
});

function etClock(ts: string): string {
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? clockFormatter.format(new Date(ms)) : ts;
}

function pctText(pct: number): string {
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

const DIRECTION_NAMES: Record<string, string> = { long: "做多", short: "做空", neutral: "观望" };

function directionLine(report: RecapSymbolReport): string {
  if (!report.direction) return "- 当日没有落盘的预测";
  const name = DIRECTION_NAMES[report.direction] ?? report.direction;
  if (report.direction === "neutral") {
    return report.zone ? `- 预测方向：${name}（区间 ${report.zone.low}–${report.zone.high}）` : `- 预测方向：${name}`;
  }
  if (report.entry == null || report.stop == null) return `- 预测方向：${name}`;
  const target = report.target1 != null ? ` / 目标 ${report.target1}` : "";
  return `- 预测方向：${name}（入场 ${report.entry} / 止损 ${report.stop}${target}）`;
}

function outcomeLine(outcome: AnalysisOutcome | null): string {
  if (!outcome) return "- 结局：无法判定（K 线覆盖不到锚点）";
  const pct = pctText(outcome.pct_since_anchor);
  if (outcome.status === "hit_target") return `- 结局：盘中打到目标，锚点以来 ${pct}`;
  if (outcome.status === "hit_stop") return `- 结局：盘中打到止损，锚点以来 ${pct}`;
  if (outcome.status === "held_range") return `- 结局：整段守住预判区间，锚点以来 ${pct}`;
  if (outcome.status === "broke_range") return `- 结局：收盘价离开预判区间（观望判断失效），锚点以来 ${pct}`;
  return `- 结局：收盘未了结，锚点以来 ${pct}`;
}

function commentLines(comments: CockpitComment[]): string[] {
  if (!comments.length) return ["- 当日没有 AI 点评"];
  const counts = new Map<string, number>();
  for (const c of comments) counts.set(c.level, (counts.get(c.level) ?? 0) + 1);
  const parts = LEVEL_ORDER.filter((l) => counts.has(l)).map((l) => `${LEVEL_LABEL[l]} ${counts.get(l)}`);
  const lines = [`- 点评共 ${comments.length} 条：${parts.join(" · ")}`];

  const triggers = new Map<string, number>();
  for (const c of comments) {
    if (!c.trigger) continue;
    const kind = c.trigger.split(":")[0].trim();
    triggers.set(kind, (triggers.get(kind) ?? 0) + 1);
  }
  if (triggers.size) {
    const tally = [...triggers.entries()].map(([k, n]) => `${k} ×${n}`).join(" · ");
    lines.push(`- 触发分布：${tally}`);
  }

  const notable = comments.filter((c) => c.level === "alert" || c.level === "warn");
  if (notable.length) {
    lines.push("- 警报与提醒：");
    for (const c of notable) {
      lines.push(`  - ${etClock(c.ts)}（美东）【${LEVEL_LABEL[c.level]}】${c.text}`);
    }
  }
  return lines;
}

function scoreboardLines(reports: RecapSymbolReport[]): string[] {
  const rows: StatsRow[] = [];
  for (const report of reports) {
    if (!report.direction) continue;
    rows.push({ direction: report.direction, origin: report.origin, outcome: report.outcome });
  }
  if (!rows.length) return ["当日没有落盘的预测，记分板为空。"];

  const stats = aggregateStats(rows);
  const { overall } = stats;
  const winRateText =
    overall.win_rate != null ? `${(overall.win_rate * 100).toFixed(1)}%（与 /api/overview/stats 同一机械口径）` : "——（当日无已了结样本）";
  const avgRText =
    overall.avg_r != null
      ? `${overall.avg_r >= 0 ? "+" : ""}${overall.avg_r.toFixed(2)}（每笔平均赚/亏多少个止损单位）`
      : "——（当日无已了结样本）";

  return [
    `- 样本 ${overall.total}：命中目标 ${overall.hit_target} · 打止损 ${overall.hit_stop} · 守区间 ${overall.held_range} · 破区间 ${overall.broke_range} · 未了结 ${overall.open} · 无法判定 ${overall.unjudged}`,
    `- 命中率（已了结口径）：${winRateText}`,
    `- 平均盈亏倍数 avg_r：${avgRText}`,
    `- 多单 ${stats.by_direction.long.total} 笔 / 空单 ${stats.by_direction.short.total} 笔 / 观望 ${stats.by_direction.neutral.total} 笔`,
  ];
}

function usageLines(usage: AiUsageSummary | null): string[] {
  if (!usage || usage.runs === 0) return ["当日没有记录到 AI 花费。"];
  const lines = [
    `共 ${usage.runs} 次运行 · ${usage.total_tokens} tokens · $${usage.cost_total.toFixed(4)}`,
  ];
  for (const [layer, s] of Object.entries(usage.by_layer)) {
    lines.push(`- ${layer}：${s.runs} 次 · ${s.total_tokens} tokens · $${s.cost_total.toFixed(4)}`);
  }
  return lines;
}

export function buildRecapMarkdown(
  date: string,
  reports: RecapSymbolReport[],
  usage: AiUsageSummary | null,
): string {
  const sections: string[] = [`# ${date} 盘中自动小结`, "", "收盘后由 AI 调度器自动生成。"];
  if (!reports.length) {
    sections.push("", "当日没有跟踪中的 intraday 标的。");
  }
  for (const report of reports) {
    sections.push("", `## ${report.symbol}`, "");
    sections.push(directionLine(report));
    if (report.direction) sections.push(outcomeLine(report.outcome));
    sections.push(...commentLines(report.comments));
  }
  sections.push("", "## 当日记分板", "");
  sections.push(...scoreboardLines(reports));
  sections.push("", "## 当日 AI 花费", "");
  sections.push(...usageLines(usage));
  sections.push("");
  return sections.join("\n");
}

export interface RecapDeps {
  journalDir: string;
  listCharts: typeof listCharts;
  loadChart: typeof loadChart;
  fetchKline: (symbol: string, period: string, count: number) => Promise<RawBar[]>;
  listComments: (symbol: string, date: string) => Promise<CockpitComment[]>;
  listUsage: (date: string) => Promise<AiUsageRecord[]>;
  getOutcome: (chartId: string) => Promise<AnalysisOutcome | null>;
  saveOutcome: (key: OutcomeKey, outcome: AnalysisOutcome) => Promise<void>;
}

export const defaultRecapDeps: RecapDeps = {
  journalDir: JOURNAL_DIR,
  listCharts,
  loadChart,
  fetchKline: (symbol, period, count) => getProvider().getKline(symbol, period, count),
  listComments,
  listUsage,
  getOutcome: async (chartId) => (await getResolvedOutcomes([chartId])).get(chartId) ?? null,
  saveOutcome: saveResolvedOutcome,
};

async function buildSymbolReport(
  symbol: string,
  metas: ChartMeta[],
  date: string,
  deps: RecapDeps,
): Promise<RecapSymbolReport> {
  const latest = metas[0];
  const [doc, comments] = await Promise.all([deps.loadChart(latest.id), deps.listComments(symbol, date)]);
  const prediction = (doc?.input.prediction as IntradayPrediction | null | undefined) ?? null;
  const plan = doc && doc.built.kind === "intraday" ? doc.built.entryPlan : null;
  const anchor = prediction?.anchor ? { time: prediction.anchor.time, price: prediction.anchor.price } : null;
  const outcomePlan = plan ? { entry: plan.entry, stop: plan.stop, target1: plan.target1 } : null;
  let outcome = attachRMultiple(
    await deps.getOutcome(latest.id).catch(() => null),
    prediction?.direction ?? null,
    outcomePlan,
  );
  if (!outcome && prediction?.direction && anchor) {
    const bars = await deps.fetchKline(symbol, "15m", OUTCOME_BARS).catch(() => null);
    outcome = bars
      ? judgeOutcome(prediction.direction, anchor, outcomePlan, bars, zoneFromPrediction(prediction))
      : null;
    if (outcome && outcome.status !== "open") {
      await deps
        .saveOutcome({ chartId: latest.id, symbol, direction: prediction.direction }, outcome)
        .catch(() => {});
    }
  }
  return {
    symbol,
    direction: prediction?.direction ?? null,
    origin: doc?.input.origin === "analyst" ? "analyst" : "manual",
    entry: plan?.entry ?? null,
    stop: plan?.stop ?? null,
    target1: plan?.target1 ?? null,
    zone: zoneFromPrediction(prediction),
    outcome,
    comments,
  };
}

export async function runDailyRecap(
  date: string,
  deps: RecapDeps = defaultRecapDeps,
): Promise<{ written: boolean; path: string }> {
  const path = join(deps.journalDir, `${date}-intraday-recap.md`);
  const exists = await fs.access(path).then(
    () => true,
    () => false,
  );
  if (exists) return { written: false, path };

  const metas = await deps.listCharts({ type: "intraday" });
  const bySymbol = new Map<string, ChartMeta[]>();
  for (const meta of metas) {
    if (!meta.symbol || easternDate(new Date(meta.created_at)) !== date) continue;
    const list = bySymbol.get(meta.symbol);
    if (list) list.push(meta);
    else bySymbol.set(meta.symbol, [meta]);
  }

  const reports = await Promise.all(
    [...bySymbol.entries()].map(([symbol, symbolMetas]) => buildSymbolReport(symbol, symbolMetas, date, deps)),
  );
  const usage = summarizeUsage(date, await deps.listUsage(date));

  await fs.mkdir(deps.journalDir, { recursive: true });
  await fs.writeFile(path, buildRecapMarkdown(date, reports, usage));
  return { written: true, path };
}
