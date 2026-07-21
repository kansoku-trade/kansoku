import type { EpisodeAnswer } from '../schema/episode.js';
import type { Question } from '../schema/question.js';
import type { EpisodeDataAudit } from './audit.js';
import { loadBenchReportUiAssets } from '../report/uiAssets.js';
import { escapeHtml, serializeForScript } from '../report/htmlFormat.js';
import { aggregate, aggregateReasons, type EpisodeReportSummary } from './metrics.js';
import { buildRows } from './rows.js';
import { buildEpisodeReportViewData, type EpisodeConfigSummary } from './viewModel.js';

export type {
  EpisodeReasonCoverage,
  EpisodeReasonStat,
  EpisodeReportSummary,
} from './metrics.js';

export interface EpisodeReportConfigSnapshot {
  runId?: string;
  startedAt?: string;
  datasetVersion?: string;
  bank?: string;
  gitSha?: string | null;
  executionMode?: string;
  costBps?: number;
  config?: {
    models?: string[];
    modes?: string[];
    repeat?: number;
    timeoutMs?: number;
    datasetVersion?: string;
  };
}

export interface EpisodeProvenanceEntry {
  sourceSymbol: string;
  sourceCutoff: string;
  syntheticCutoff?: string;
  dayShift?: number;
  priceScale?: number;
  volumeScale?: number;
}

export interface EpisodeReportInput {
  answers: EpisodeAnswer[];
  questions: Map<string, Question>;
  config: EpisodeReportConfigSnapshot;
  audits?: EpisodeDataAudit[];
  traces?: Map<string, EpisodeReportTraceLine[]>;
  now?: () => Date;
  datasetMeta?: { label?: string; kind?: string };
  provenance?: Map<string, EpisodeProvenanceEntry>;
}

export interface EpisodeReportTraceContext {
  virtualAsOf?: string;
  barIndex?: number;
  phase?: string;
  decisionBar?: number | null;
  remainingBars?: number;
  tradeCount?: number;
  episodeNetR?: number;
  order?: unknown;
  position?: unknown;
}

export interface EpisodeReportTraceLine {
  type?: string;
  sequence?: number;
  atMs?: number;
  name?: string;
  args?: Record<string, unknown> | null;
  contextBefore?: EpisodeReportTraceContext | null;
  contextAfter?: EpisodeReportTraceContext | null;
  resultSummary?: string;
  isError?: boolean;
  durationMs?: number;
  virtualAsOf?: string;
  barIndex?: number;
  phase?: string;
  remainingBars?: number;
  tradeCount?: number;
  episodeNetR?: number;
  warningInjected?: boolean;
  warningPriority?: 'high' | 'critical' | null;
}

function buildConfigSummary(firstQuestion: Question | undefined): EpisodeConfigSummary | null {
  if (!firstQuestion) return null;
  return {
    h1: firstQuestion.fixtures.kline['1h']?.length ?? 0,
    day: firstQuestion.fixtures.kline.day?.length ?? 0,
    week: firstQuestion.fixtures.kline.week?.length ?? 0,
    sessions: firstQuestion.replay.horizonSessions ?? null,
    bars: firstQuestion.replay.horizonBars,
    decisionExpiry: firstQuestion.replay.decisionExpiryBars ?? null,
    expiry: firstQuestion.replay.entryExpiryBars ?? null,
    dayRollups: firstQuestion.replay.rollups?.day.length ?? 0,
    weekRollups: firstQuestion.replay.rollups?.week.length ?? 0,
  };
}

export function renderEpisodeReportHtml(input: EpisodeReportInput): {
  html: string;
  summary: EpisodeReportSummary;
} {
  const generatedAt = (input.now ?? (() => new Date()))().toISOString();
  const rows = buildRows(input.answers, input.questions, input.traces, input.provenance);
  const metrics = aggregate(rows);
  const reasonMetrics = aggregateReasons(rows);
  const runId = input.config.runId ?? 'episode-run';
  const audits = input.audits ?? [];
  const auditChecks = audits.flatMap((audit) => audit.checks);
  const auditPassed =
    audits.length > 0 ? auditChecks.every((check) => check.status === 'pass') : null;
  const datasetId = input.config.datasetVersion ?? input.config.config?.datasetVersion ?? '—';
  const models = input.config.config?.models ?? [
    ...new Set(input.answers.map((answer) => answer.model)),
  ];
  const modes = input.config.config?.modes ?? [
    ...new Set(input.answers.map((answer) => answer.mode)),
  ];

  const summary: EpisodeReportSummary = {
    runId,
    generatedAt,
    totalCases: metrics.cases,
    completionRate: metrics.completionRate,
    averageNetRPerCase: metrics.avgNetRPerCase,
    winRate: metrics.winRate,
    totalTrades: metrics.trades,
    tradeWinRate: metrics.tradeWinRate,
    tradeExpectancyR: metrics.expectancy,
    directionAccuracy: metrics.directionAccuracy,
    participationRate: metrics.participationRate,
    fillRate: metrics.fillRate,
    profitFactor: metrics.profitFactor,
    averageHoldingBars: metrics.avgHoldingBars,
    averageMfeR: metrics.avgMfeR,
    averageMaeR: metrics.avgMaeR,
    averageMaxDrawdownR: metrics.avgMaxDrawdownR,
    averageCostUsd: metrics.avgCostUsd,
    averageDurationMs: metrics.avgDurationMs,
    averageToolCalls: metrics.avgToolCalls,
    averageTokens: metrics.avgTokens,
    averageDecisionBars: metrics.avgDecisionBars,
    reasonCoverage: reasonMetrics.coverage,
    reasonedActions: reasonMetrics.reasonedActions,
    decisionActions: reasonMetrics.decisionActions,
    reasonCoverageByModel: reasonMetrics.coverageByModel,
    reasonStats: reasonMetrics.stats,
    dataAuditPassed: auditPassed,
  };

  const viewData = buildEpisodeReportViewData({
    rows,
    metrics,
    reasonMetrics,
    runId,
    generatedAt,
    gitSha: input.config.gitSha ?? null,
    costBps: input.config.costBps ?? 0,
    datasetId,
    datasetMeta: input.datasetMeta,
    models,
    modes,
    auditPassed,
    audits,
    config: buildConfigSummary(rows[0]?.question),
  });

  const assets = loadBenchReportUiAssets('episode');
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="color-scheme" content="dark"/><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%23ffb000'/%3E%3Cpath d='M8 7h4v7l7-7h5l-8 8 9 10h-5l-8-9v9H8z' fill='%230a0a0a'/%3E%3C/svg%3E"/><title>${escapeHtml(runId)} · Episode Bench Report</title><style>${assets.css}</style></head><body><div id="root"></div><script>window.__KANSOKU_REPORT_DATA__=${serializeForScript(viewData)};</script><script>${assets.js}</script></body></html>`;

  return { html, summary };
}
