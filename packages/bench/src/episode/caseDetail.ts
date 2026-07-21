import type {
  EpisodeReportActionRecordView,
  EpisodeReportCaseDetailView,
  EpisodeReportFactItem,
  EpisodeReportProcessCheckView,
  EpisodeReportProcessEventView,
  EpisodeReportTradeLedgerItem,
  ToneClass,
} from '@kansoku/bench-report-ui/types';
import type { EpisodeActionRecord, EpisodeClosedTrade } from '../schema/episode.js';
import { chartTime, type ChartTimeframe } from './chartPayload.js';
import {
  ACTION_LABELS,
  DIRECTION_LABELS,
  MODE_LABELS,
  REASON_LABELS,
  TERMINATION_LABELS,
  fmt,
  fmtDuration,
  fmtPercent,
  fmtSigned,
  phaseLabel,
  valueClass,
} from './labels.js';
import { processChecks, type ProcessEvent } from './process.js';
import {
  actionReason,
  closedTrades,
  decisionBar,
  formatProvenanceLine,
  observationBars,
  replayBarIndex,
  tradeEntryReason,
  tradeExitLabel,
  type ReportRow,
} from './rows.js';

function fact(label: string, value: string, tone: ToneClass | '' = ''): EpisodeReportFactItem {
  return { label, value, tone };
}

function processEventView(event: ProcessEvent): EpisodeReportProcessEventView {
  const bar =
    event.barBefore === event.barAfter
      ? `B${event.snapshotBar}`
      : `B${event.barBefore} → B${event.barAfter}`;
  const transition =
    event.phaseBefore === event.phaseAfter
      ? phaseLabel(event.phaseAfter)
      : `${phaseLabel(event.phaseBefore)} → ${phaseLabel(event.phaseAfter)}`;
  return {
    sequence: event.sequence,
    tool: event.tool,
    label: event.label,
    detail: event.detail,
    kind: event.kind,
    barLabel: bar,
    transitionLabel: transition,
    timeframe: event.timeframe,
    durationLabel: event.durationMs == null ? null : fmtDuration(event.durationMs),
    snapshotBar: event.snapshotBar,
    isError: event.isError,
  };
}

function tradeLedgerItem(row: ReportRow, trade: EpisodeClosedTrade): EpisodeReportTradeLedgerItem {
  const entryBar = replayBarIndex(row.question, trade.entry.time);
  const exitBar = replayBarIndex(row.question, trade.exit.time);
  const entryReason = tradeEntryReason(row, trade);
  return {
    tradeId: trade.tradeId,
    direction: trade.direction,
    directionLabel: DIRECTION_LABELS[trade.direction] ?? trade.direction,
    decisionBar: trade.decisionBar,
    entryBar,
    exitBar,
    exitLabel: tradeExitLabel(trade),
    entryReasonCategoryLabel: entryReason
      ? (REASON_LABELS[entryReason.category] ?? entryReason.category)
      : null,
    entryReasonSummary: entryReason?.summary ?? null,
    entryPrice: trade.entry.price,
    initialStop: trade.initialStop,
    finalStop: trade.finalStop,
    target: trade.target,
    exitPrice: trade.exit.price,
    netR: trade.netR,
    tone: valueClass(trade.netR),
  };
}

function actionRecordView(record: EpisodeActionRecord): EpisodeReportActionRecordView {
  const reason = actionReason(record);
  const time = record.effectiveBarTime;
  const chartTimes = time
    ? ({
        h1: chartTime(time, 'h1'),
        day: chartTime(time, 'day'),
        week: chartTime(time, 'week'),
      } as Record<ChartTimeframe, number | string>)
    : null;
  return {
    step: record.step,
    actionType: record.action.type,
    actionLabel: ACTION_LABELS[record.action.type] ?? record.action.type,
    reasonCategoryLabel: reason ? (REASON_LABELS[reason.category] ?? reason.category) : null,
    reasonSummary: reason?.summary ?? null,
    timeLabel: record.effectiveBarTime ?? record.at,
    chartTimes,
  };
}

export function buildCaseDetail(
  row: ReportRow,
  index: number,
  available: ChartTimeframe[],
  finalBarIndex: number,
): EpisodeReportCaseDetailView {
  const answer = row.answer;
  const result = answer.result;
  const plan = answer.initialSubmission?.entry_plan;
  const outcome = result?.terminationReason ?? answer.status;
  const actions = result?.actions ?? [];
  const submittedAt = decisionBar(answer);
  const entryAt = replayBarIndex(row.question, result?.entry?.time);
  const exitAt = replayBarIndex(row.question, result?.exit?.time);
  const trades = closedTrades(answer);
  const initialReason = answer.initialSubmission?.decision_reason;
  const defaultTimeframe: ChartTimeframe = available[0] ?? 'day';

  const timingParts = [
    submittedAt == null ? '未提交决策' : `决策 B${submittedAt}`,
    trades.length === 0 ? '全程空仓' : `${trades.length} 笔完整交易`,
    entryAt == null || exitAt == null ? '无成交区间' : `首次成交 B${entryAt} · 最后退出 B${exitAt}`,
  ];

  const isEpisodeComplete = answer.status === 'completed';
  const checks: EpisodeReportProcessCheckView[] =
    row.processEvents.length === 0
      ? []
      : processChecks(row.processEvents, row.trace, finalBarIndex, isEpisodeComplete, available);

  const planFacts: EpisodeReportFactItem[] = [
    fact('方向', DIRECTION_LABELS[answer.initialSubmission?.direction ?? ''] ?? '—'),
    fact('首次决策', submittedAt == null ? '—' : `B${submittedAt}`),
    fact('自主观察', `${observationBars(answer)} bars`),
    fact('计划入场', fmt(plan?.entry), 'positive'),
    fact('止损', fmt(plan?.stop), 'negative'),
    fact('止盈', fmt(plan?.target1), 'positive'),
    fact('计划盈亏比', `${fmt(row.plannedRr)} R`),
    fact('止损距离', fmtPercent(row.stopDistancePct)),
  ];

  const resultFacts: EpisodeReportFactItem[] = [
    fact('完整交易', `${trades.length} 笔`),
    fact(
      '盈利 / 亏损',
      `${result?.winCount ?? trades.filter((trade) => trade.netR > 0).length} / ${result?.lossCount ?? trades.filter((trade) => trade.netR < 0).length}`,
    ),
    fact(
      'Gross / Net R',
      `${fmtSigned(result?.grossR, 3)} / ${fmtSigned(result?.netR, 3)}`,
      valueClass(result?.netR),
    ),
    fact('最大回撤', `${fmt(result?.maxDrawdownR)} R`),
    fact('MFE / MAE', `${fmt(result?.mfeR)} / ${fmt(result?.maeR)}`),
    fact(
      '首次成交 / 末次退出',
      `${entryAt == null ? '—' : `B${entryAt}`} / ${exitAt == null ? '—' : `B${exitAt}`}`,
    ),
    fact('累计持有', `${result?.holdingBars ?? 0} bars`),
    fact('方向命中', row.directionHit == null ? '—' : row.directionHit ? '是' : '否'),
  ];

  return {
    index,
    anchorId: `case-${index}`,
    chartId: `trade-chart-${index}`,
    symbol: answer.symbol,
    provenanceSymbol: row.provenance?.sourceSymbol ?? null,
    provenanceLine: row.provenance ? formatProvenanceLine(row.provenance) : null,
    questionId: answer.questionId,
    model: answer.model,
    modeLabel: MODE_LABELS[answer.mode] ?? answer.mode,
    outcome,
    outcomeLabel: TERMINATION_LABELS[outcome] ?? outcome,
    netR: result?.netR ?? null,
    tone: valueClass(result?.netR),
    availableTimeframes: available,
    defaultTimeframe,
    planFacts,
    planReasonCategoryLabel: initialReason
      ? (REASON_LABELS[initialReason.category] ?? initialReason.category)
      : null,
    planReasonSummary: initialReason?.summary ?? plan?.rationale ?? null,
    planRationale: !initialReason && plan?.rationale ? plan.rationale : null,
    resultFacts,
    trades: trades.map((trade) => tradeLedgerItem(row, trade)),
    actions: actions.map(actionRecordView),
    process: {
      timingLabel: timingParts.join(' · '),
      hasTrace: row.processEvents.length > 0,
      events: row.processEvents.map(processEventView),
      checks,
    },
  };
}
