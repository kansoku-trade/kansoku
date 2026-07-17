import type { RunConfig } from "../schema/runConfig.js";
import type { ReportSummary } from "../schema/reportSummary.js";
import type { AgreementMatrix, AgreementPair, DifficultyTiers, QuestionDifficultyEntry } from "../score/analysis.js";
import type { CellVerdict } from "../score/cell.js";
import type { ModelAggregate } from "../score/aggregate.js";
import type { Scores } from "../schema/scores.js";
import { DASH, escapeCell, fmtCostUsd, fmtCount, fmtDurationMs, fmtRate, fmtScore } from "./format.js";
import { renderTable } from "./table.js";

export interface ReportConfigSnapshot {
  runId?: string;
  startedAt?: string;
  datasetVersion?: string;
  bank?: string;
  gitSha?: string | null;
  config?: RunConfig;
  concurrency?: Record<string, number>;
  baselines?: string[];
  modes?: string[];
}

export interface RenderReportOptions {
  now?: () => Date;
}

export interface RenderReportResult {
  markdown: string;
  summary: ReportSummary;
}

const REGIME_LABEL: Record<string, string> = { up: "上涨段", down: "下跌段" };
const MODE_LABEL: Record<string, string> = { blind: "盲盘", live: "实盘" };

function baselineTag(model: string): string | null {
  if (model.startsWith("baseline/")) return "（基线）";
  if (model.startsWith("gold/")) return "（黄金基线）";
  return null;
}

function modelCell(model: string): string {
  const tag = baselineTag(model);
  const escaped = escapeCell(model);
  return tag ? `${escaped} ${tag}` : escaped;
}

function sortModels(models: ModelAggregate[]): ModelAggregate[] {
  return [...models].sort((a, b) => b.total - a.total || a.model.localeCompare(b.model));
}

function renderRunInfo(scores: Scores, config: ReportConfigSnapshot, generatedAt: string): string[] {
  const runId = config.runId ?? scores.runId;
  const models = config.config?.models ?? [...new Set(scores.models.map((m) => m.model))].sort();
  const modeList = config.config?.modes ?? config.modes ?? [...new Set(scores.cells.map((c) => c.mode))].sort();
  const repeat = config.config?.repeat;
  const gitSha = config.gitSha ?? "—";

  const lines = [
    "## 运行信息",
    "",
    `- 运行 ID：${runId}`,
    `- 数据集版本：${scores.datasetVersion}`,
    `- 模型列表：${models.length > 0 ? models.map(escapeCell).join("、") : "—"}`,
    `- 模式：${modeList.length > 0 ? modeList.map((m) => MODE_LABEL[m] ?? m).join("、") : "—"}`,
    `- 重复次数：${repeat ?? "—"}`,
    `- 权重：判断 ${scores.weights.judgment} / 效率 ${scores.weights.efficiency}`,
    `- Git SHA：${gitSha}`,
    `- 生成时间：${generatedAt}`,
  ];
  return lines;
}

function renderLeaderboard(models: ModelAggregate[]): string[] {
  const headers = [
    "排名",
    "model",
    "总分",
    "判断分",
    "效率分",
    "胜率",
    "期望收益",
    "赢单平均盈亏比",
    "观望率",
    "观望正确率",
    "抗噪分",
    "一致性",
    "平均耗时",
    "平均成本",
    "平均工具调用",
    "未成交率",
    "违规率",
  ];
  const rows = models.map((m, i) => [
    String(i + 1),
    modelCell(m.model),
    fmtScore(m.total),
    fmtScore(m.judgment),
    fmtScore(m.efficiency),
    fmtRate(m.winRate),
    fmtScore(m.expectancy),
    fmtScore(m.avgWinnerR),
    fmtRate(m.abstainRate),
    fmtRate(m.neutralAccuracy),
    fmtScore(m.noiseDelta),
    fmtScore(m.consistency),
    fmtDurationMs(m.meanDurationMs),
    fmtCostUsd(m.meanCostUsd),
    fmtCount(m.toolCalls.mean),
    fmtRate(m.noFillRate),
    fmtRate(m.formatViolationRate),
  ]);
  return ["## 总榜", "", ...renderTable(headers, rows)];
}

function renderSplitTable(
  title: string,
  models: ModelAggregate[],
  dimension: "layers" | "regimes" | "modes",
  labels: Record<string, string>,
): string[] {
  const keySet = new Set<string>();
  for (const model of models) for (const key of Object.keys(model[dimension])) keySet.add(key);
  const keys = [...keySet].sort();
  if (keys.length === 0) return [`### ${title}`, "", "无数据。", ""];

  const headers = ["model", ...keys.map((key) => labels[key] ?? key)];
  const rows = models.map((model) => [
    modelCell(model.model),
    ...keys.map((key) => fmtScore(model[dimension][key]?.judgment)),
  ]);
  return [`### ${title}`, "", ...renderTable(headers, rows), ""];
}

function renderLayeredBoard(models: ModelAggregate[]): string[] {
  return [
    "## 分层榜",
    "",
    ...renderSplitTable("按股票层", models, "layers", {}),
    ...renderSplitTable("按市场状态", models, "regimes", REGIME_LABEL),
    ...renderSplitTable("按模式", models, "modes", MODE_LABEL),
  ];
}

function renderDifficultyList(title: string, entries: QuestionDifficultyEntry[]): string[] {
  const lines = [`### ${title}`, ""];
  if (entries.length === 0) {
    lines.push("无数据。", "");
    return lines;
  }
  for (const entry of entries) {
    const nLabel = entry.nModels === 1 ? "n=1" : `n=${entry.nModels}`;
    lines.push(`- ${escapeCell(entry.questionId)}：${nLabel}，均分 ${fmtScore(entry.meanScore)}`);
  }
  lines.push("");
  return lines;
}

function renderDifficultyTiers(tiers: DifficultyTiers): string[] {
  return [
    "## 题目难度分级",
    "",
    ...renderDifficultyList("全对题", tiers.allCorrect),
    ...renderDifficultyList("全错题", tiers.allWrong),
    ...renderDifficultyList("分歧题", tiers.split),
    "> 全错题可能是陷阱题，也可能是出题本身有问题，需要人工复核，不要直接当作模型判断力差的证据。",
  ];
}

function formatAgreementCell(pair: AgreementPair | undefined): string {
  if (!pair) return DASH;
  const suffix = pair.sharedCount < 20 ? ` (${pair.sharedCount})` : "";
  if (pair.sharedCount < 5 || pair.agreementRate == null) return `${DASH}${suffix}`;
  return `${fmtRate(pair.agreementRate)}${suffix}`;
}

function renderAgreementMatrix(matrix: AgreementMatrix): string[] {
  const lines = ["## 模型同质化矩阵", ""];
  if (matrix.models.length < 2) {
    lines.push("参与比较的模型不足两个，无法计算。");
    return lines;
  }

  const pairMap = new Map<string, AgreementPair>();
  for (const pair of matrix.pairs) pairMap.set(`${pair.a}|${pair.b}`, pair);

  const headers = ["model", ...matrix.models.map(escapeCell)];
  const rows = matrix.models.map((rowModel) => [
    modelCell(rowModel),
    ...matrix.models.map((colModel) => {
      if (rowModel === colModel) return DASH;
      const key = rowModel < colModel ? `${rowModel}|${colModel}` : `${colModel}|${rowModel}`;
      return formatAgreementCell(pairMap.get(key));
    }),
  ]);
  return [...lines, ...renderTable(headers, rows)];
}

function sortCellsForDrilldown(cells: CellVerdict[]): CellVerdict[] {
  return [...cells].sort(
    (a, b) => a.model.localeCompare(b.model) || a.mode.localeCompare(b.mode) || a.rep - b.rep,
  );
}

function renderDrilldown(cells: CellVerdict[]): string[] {
  const byQuestion = new Map<string, CellVerdict[]>();
  for (const cell of cells) {
    const bucket = byQuestion.get(cell.questionId);
    if (bucket) bucket.push(cell);
    else byQuestion.set(cell.questionId, [cell]);
  }
  const questionIds = [...byQuestion.keys()].sort();

  const lines = ["## 单题钻取", ""];
  if (questionIds.length === 0) {
    lines.push("无数据。");
    return lines;
  }

  const headers = ["model", "mode", "rep", "方向", "入场", "止损", "目标", "结果", "得分", "trace"];
  for (const questionId of questionIds) {
    const rows = sortCellsForDrilldown(byQuestion.get(questionId) ?? []).map((cell) => {
      return [
        modelCell(cell.model),
        MODE_LABEL[cell.mode] ?? cell.mode,
        String(cell.rep),
        cell.direction ?? "—",
        fmtScore(cell.entry),
        fmtScore(cell.stop),
        fmtScore(cell.target),
        cell.outcome,
        fmtScore(cell.score),
        cell.traceRef ? `[trace](${cell.traceRef})` : "—",
      ];
    });
    lines.push(`### ${questionId}`, "", ...renderTable(headers, rows), "");
  }
  return lines;
}

function buildSummary(scores: Scores, models: ModelAggregate[], generatedAt: string): ReportSummary {
  const ranking = models.map((m) => ({
    model: m.model,
    total: m.total,
    judgment: m.judgment,
    efficiency: m.efficiency,
    abstainRate: m.abstainRate,
    avgWinnerR: m.avgWinnerR,
  }));
  const buyHold = scores.models.find((m) => m.model === "baseline/buy-hold");
  const modelsBeatingBuyHold = buyHold
    ? models
        .filter((m) => !m.model.startsWith("baseline/") && !m.model.startsWith("gold/") && m.judgment > buyHold.judgment)
        .map((m) => m.model)
    : [];
  return {
    runId: scores.runId,
    generatedAt,
    ranking,
    baselineComparison: { modelsBeatingBuyHold },
  };
}

export function renderReport(
  scores: Scores,
  config: ReportConfigSnapshot,
  options: RenderReportOptions = {},
): RenderReportResult {
  const now = options.now ?? (() => new Date());
  const generatedAt = now().toISOString();
  const models = sortModels(scores.models);

  const sections = [
    `# 模型交易基准报告：${scores.runId}`,
    "",
    ...renderRunInfo(scores, config, generatedAt),
    "",
    ...renderLeaderboard(models),
    "",
    ...renderLayeredBoard(models),
    "",
    ...renderDifficultyTiers(scores.analysis.difficultyTiers),
    "",
    ...renderAgreementMatrix(scores.analysis.agreementMatrix),
    "",
    ...renderDrilldown(scores.cells),
  ];

  const markdown = `${sections.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
  const summary = buildSummary(scores, models, generatedAt);
  return { markdown, summary };
}
