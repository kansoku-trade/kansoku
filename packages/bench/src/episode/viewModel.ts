import type {
  EpisodeReportAuditCheckView,
  EpisodeReportCaseRowView,
  EpisodeReportChartPayload,
  EpisodeReportConfigStripItem,
  EpisodeReportMetricCell,
  EpisodeReportModelRowView,
  EpisodeReportReasonStatView,
  EpisodeReportViewData,
} from '@kansoku/bench-report-ui/types';
import type { EpisodeDataAudit } from './audit.js';
import { buildCaseDetail } from './caseDetail.js';
import { availableTimeframesFor, buildChartPayload, finalVisibleBarIndex } from './chartPayload.js';
import {
  ACTION_LABELS,
  DIRECTION_LABELS,
  MODE_LABELS,
  PLAYSTYLE_LABEL,
  REASON_LABELS,
  TERMINATION_LABELS,
  fmt,
  fmtDuration,
  fmtPercent,
  fmtSigned,
  fmtUsd,
  valueClass,
} from './labels.js';
import { aggregate, type AggregateMetrics, type ReasonMetrics } from './metrics.js';
import { closedTrades, decisionBar, type ReportRow } from './rows.js';

export interface EpisodeConfigSummary {
  h1: number;
  day: number;
  week: number;
  sessions: number | null;
  bars: number | null;
  decisionExpiry: number | null;
  expiry: number | null;
  dayRollups: number;
  weekRollups: number;
}

export interface BuildEpisodeReportViewDataInput {
  rows: ReportRow[];
  metrics: AggregateMetrics;
  reasonMetrics: ReasonMetrics;
  runId: string;
  generatedAt: string;
  gitSha: string | null;
  costBps: number;
  datasetId: string;
  datasetMeta?: { label?: string; kind?: string };
  models: string[];
  modes: string[];
  auditPassed: boolean | null;
  audits: EpisodeDataAudit[];
  config: EpisodeConfigSummary | null;
}

function metricCell(
  label: string,
  value: string,
  note: string,
  tone: EpisodeReportMetricCell['tone'] = 'neutral',
): EpisodeReportMetricCell {
  return { label, value, note, tone };
}

function buildMetrics(metrics: AggregateMetrics, costBps: number): EpisodeReportMetricCell[] {
  return [
    metricCell(
      '平均净 R / case',
      `${fmtSigned(metrics.avgNetRPerCase, 3)} R`,
      `累计 ${fmtSigned(metrics.totalNetR, 3)} R`,
      valueClass(metrics.avgNetRPerCase),
    ),
    metricCell('Episode 胜率', fmtPercent(metrics.winRate), `${metrics.wins} / ${metrics.completed} cases`, 'positive'),
    metricCell('交易胜率', fmtPercent(metrics.tradeWinRate), `${metrics.tradeWins} / ${metrics.trades} 笔`, 'positive'),
    metricCell('方向命中', fmtPercent(metrics.directionAccuracy), 'cutoff → horizon'),
    metricCell(
      'Profit Factor',
      metrics.profitFactor === 'infinite' ? '∞' : fmt(metrics.profitFactor),
      '盈利 R / 亏损 R',
    ),
    metricCell(
      '参与 / 成交',
      `${fmtPercent(metrics.participationRate)} / ${fmtPercent(metrics.fillRate)}`,
      `${metrics.directional} 个方向订单`,
    ),
    metricCell(
      '单笔期望',
      `${fmtSigned(metrics.expectancy, 3)} R`,
      '已成交交易',
      valueClass(metrics.expectancy),
    ),
    metricCell(
      'MFE / MAE',
      `${fmt(metrics.avgMfeR)} / ${fmt(metrics.avgMaeR)}`,
      `捕获 ${fmtPercent(metrics.avgCaptureRate)}`,
    ),
    metricCell(
      '持有 / 回撤',
      `${fmt(metrics.avgHoldingBars, 1)} / ${fmt(metrics.avgMaxDrawdownR)} R`,
      'bars / max DD',
    ),
    metricCell('完成率', fmtPercent(metrics.completionRate), `${metrics.completed} / ${metrics.cases}`),
    metricCell('执行成本', fmtUsd(metrics.avgCostUsd), `${costBps} bps`),
    metricCell(
      '耗时 / 首次决策',
      `${fmtDuration(metrics.avgDurationMs)} / ${metrics.avgDecisionBars == null ? '—' : `B${fmt(metrics.avgDecisionBars, 1)}`}`,
      `${fmt(metrics.avgToolCalls, 1)} tools · ${fmt(metrics.avgTokens, 0)} tokens`,
    ),
  ];
}

function buildConfigStrip(config: EpisodeConfigSummary | null): EpisodeReportConfigStripItem[] {
  return [
    { label: '初始 1H', value: `${config?.h1 ?? '—'} bars` },
    { label: '初始日线', value: `${config?.day ?? '—'} bars` },
    { label: '初始周线', value: `${config?.week ?? '—'} bars` },
    { label: '回放窗口', value: `${config?.sessions ?? '—'} sessions` },
    { label: '回放 1H', value: `${config?.bars ?? '—'} bars` },
    { label: '首次决策', value: 'B0 起自主决定' },
    { label: '待成交窗口', value: `${config?.expiry ?? '—'} bars` },
    { label: '强平提醒', value: 'T-5 → T-1' },
    { label: '长桥日 / 周回填', value: `${config?.dayRollups ?? '—'} / ${config?.weekRollups ?? '—'}` },
  ];
}

function buildReasonRows(reasonMetrics: ReasonMetrics): EpisodeReportReasonStatView[] {
  return reasonMetrics.stats.map((stat) => ({
    model: stat.model,
    category: stat.category,
    categoryLabel: REASON_LABELS[stat.category] ?? stat.category,
    actions: stat.actions,
    actionBreakdown: Object.entries(stat.actionBreakdown).map(([action, count]) => ({
      action,
      actionLabel: ACTION_LABELS[action] ?? action,
      count,
    })),
    entries: stat.entries,
    trades: stat.trades,
    winRate: stat.winRate,
    averageNetR: stat.averageNetR,
    totalNetR: stat.totalNetR,
    tone: valueClass(stat.averageNetR),
  }));
}

function buildModelTable(rows: ReportRow[]): EpisodeReportModelRowView[] {
  const groups = new Map<string, ReportRow[]>();
  for (const row of rows) groups.set(row.answer.model, [...(groups.get(row.answer.model) ?? []), row]);
  return [...groups.entries()]
    .map(([model, modelRows]) => ({ model, metrics: aggregate(modelRows) }))
    .sort((a, b) => (b.metrics.avgNetRPerCase ?? -Infinity) - (a.metrics.avgNetRPerCase ?? -Infinity))
    .map((entry, index) => ({
      rank: index + 1,
      model: entry.model,
      cases: entry.metrics.cases,
      trades: entry.metrics.trades,
      avgNetRPerCase: entry.metrics.avgNetRPerCase,
      tone: valueClass(entry.metrics.avgNetRPerCase),
      winRate: entry.metrics.winRate,
      tradeWinRate: entry.metrics.tradeWinRate,
      directionAccuracy: entry.metrics.directionAccuracy,
      fillRate: entry.metrics.fillRate,
      avgCostUsd: entry.metrics.avgCostUsd,
    }));
}

function buildCaseRow(row: ReportRow, index: number): EpisodeReportCaseRowView {
  const answer = row.answer;
  const plan = answer.initialSubmission?.entry_plan;
  const result = answer.result;
  const outcome = result?.terminationReason ?? answer.status;
  const submittedAt = decisionBar(answer);
  const provSearch = row.provenance ? ` ${row.provenance.sourceSymbol}` : '';
  return {
    index,
    anchorId: `case-${index}`,
    symbol: answer.symbol,
    provenanceSymbol: row.provenance?.sourceSymbol ?? null,
    provenanceDate: row.provenance?.sourceCutoff.slice(0, 10) ?? null,
    questionId: answer.questionId,
    model: answer.model,
    mode: answer.mode,
    modeLabel: MODE_LABELS[answer.mode] ?? answer.mode,
    rep: answer.rep,
    direction: answer.initialSubmission?.direction ?? '',
    directionLabel: DIRECTION_LABELS[answer.initialSubmission?.direction ?? ''] ?? '—',
    firstDecisionLabel: submittedAt == null ? '未决策' : `B${submittedAt} 首次决策`,
    planEntry: plan?.entry ?? null,
    planStop: plan?.stop ?? null,
    planTarget: plan?.target1 ?? null,
    actualEntry: result?.entry?.price ?? null,
    actualExit: result?.exit?.price ?? null,
    tradeCount: closedTrades(answer).length,
    outcome,
    outcomeLabel: TERMINATION_LABELS[outcome] ?? outcome,
    netR: result?.netR ?? null,
    tone: valueClass(result?.netR),
    mfeR: result?.mfeR ?? null,
    maeR: result?.maeR ?? null,
    costUsd: answer.metrics.costUsd,
    durationLabel: fmtDuration(answer.metrics.durationMs),
    filterSearch: `${answer.symbol} ${answer.questionId}${provSearch}`.toLowerCase(),
  };
}

function buildAuditChecks(audits: EpisodeDataAudit[]): EpisodeReportAuditCheckView[] {
  return audits.flatMap((audit) =>
    audit.checks.map((check) => ({
      status: check.status,
      label: check.label,
      questionId: audit.questionId,
      checkId: check.id,
      detail: check.detail ?? null,
    })),
  );
}

export function buildEpisodeReportViewData(
  input: BuildEpisodeReportViewDataInput,
): EpisodeReportViewData {
  const { rows, metrics, reasonMetrics } = input;
  const charts: EpisodeReportChartPayload[] = [];
  const caseDetails = rows.map((row, index) => {
    const chart = buildChartPayload(row, index);
    if (chart) charts.push(chart);
    const available = availableTimeframesFor(row.question);
    return buildCaseDetail(row, index, available, finalVisibleBarIndex(row));
  });

  const auditChecks = buildAuditChecks(input.audits);
  const auditPassedCount = auditChecks.filter((check) => check.status === 'pass').length;

  const models = [...new Set(rows.map((row) => row.answer.model))].sort();
  const modes = [...new Set(rows.map((row) => row.answer.mode))].sort();
  const outcomes = [
    ...new Set(rows.map((row) => row.answer.result?.terminationReason ?? row.answer.status)),
  ].sort();

  const datasetBits: string[] = [input.datasetId];
  if (input.datasetMeta?.label) datasetBits.push(input.datasetMeta.label);
  if (input.datasetMeta?.kind)
    datasetBits.push(PLAYSTYLE_LABEL[input.datasetMeta.kind] ?? input.datasetMeta.kind);

  return {
    runId: input.runId,
    generatedAt: input.generatedAt,
    gitSha: input.gitSha,
    header: {
      datasetChip: datasetBits.join(' · '),
      modelsChip: input.models.join(' · '),
      modesChip: input.modes.map((mode) => MODE_LABELS[mode] ?? mode).join(' / '),
      costChip: `${input.costBps} bps`,
      auditChip: {
        label:
          input.auditPassed === true
            ? '长桥数据已校验'
            : input.auditPassed === false
              ? '数据审计失败'
              : '未附加数据审计',
        tone: input.auditPassed === true ? 'pass' : input.auditPassed === false ? 'fail' : 'neutral',
      },
    },
    summarySubtitle: `${metrics.completed}/${metrics.cases} 完成 · ${metrics.trades} 笔完整交易`,
    metrics: buildMetrics(metrics, input.costBps),
    configStrip: buildConfigStrip(input.config),
    reasonTable: {
      coverageLabel:
        reasonMetrics.coverage == null
          ? `理由覆盖 ${reasonMetrics.reasonedActions}/${reasonMetrics.decisionActions} · —`
          : `理由覆盖 ${reasonMetrics.reasonedActions}/${reasonMetrics.decisionActions} · ${fmtPercent(reasonMetrics.coverage)}`,
      rows: buildReasonRows(reasonMetrics),
    },
    modelTable: buildModelTable(rows),
    filters: {
      models,
      modes: modes.map((value) => ({ value, label: MODE_LABELS[value] ?? value })),
      outcomes: outcomes.map((value) => ({ value, label: TERMINATION_LABELS[value] ?? value })),
    },
    cases: rows.map((row, index) => buildCaseRow(row, index)),
    caseDetails,
    charts,
    audit: {
      attached: input.audits.length > 0,
      passed: auditPassedCount,
      total: auditChecks.length,
      checks: auditChecks,
    },
  };
}
