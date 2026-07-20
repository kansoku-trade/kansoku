import type { RawBar } from '@kansoku/shared/types';
import type { EpisodeActionRecord, EpisodeAnswer, EpisodeClosedTrade } from '../schema/episode.js';
import type { Question } from '../schema/question.js';
import type { EpisodeTradeReason, EpisodeTradeReasonCategory } from '../schema/tradeReason.js';
import type { EpisodeDataAudit } from './audit.js';
import { buildEpisodeQuestionViewAtCursor } from './view.js';

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
  /**
   * Map from `questionId` → provenance entry. When present, the report reveals
   * the real underlying symbol / cutoff / shift / price-scale of an anonymised
   * blind case so a human reader can interpret the case beyond its ASSETxxx
   * alias. Loaded from `<datasetsRoot>/<datasetVersion>/provenance.json` by
   * the CLI when the file exists.
   */
  provenance?: Map<string, EpisodeProvenanceEntry>;
}

const PLAYSTYLE_LABEL: Record<string, string> = {
  'single-shot': 'oneshot',
  episode: 'walkthrough',
};

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

export interface EpisodeReportSummary {
  runId: string;
  generatedAt: string;
  totalCases: number;
  completionRate: number;
  averageNetRPerCase: number | null;
  winRate: number | null;
  totalTrades: number;
  tradeWinRate: number | null;
  tradeExpectancyR: number | null;
  directionAccuracy: number | null;
  participationRate: number | null;
  fillRate: number | null;
  profitFactor: number | 'infinite' | null;
  averageHoldingBars: number | null;
  averageMfeR: number | null;
  averageMaeR: number | null;
  averageMaxDrawdownR: number | null;
  averageCostUsd: number | null;
  averageDurationMs: number | null;
  averageToolCalls: number | null;
  averageTokens: number | null;
  averageDecisionBars: number | null;
  reasonCoverage: number | null;
  reasonedActions: number;
  decisionActions: number;
  reasonCoverageByModel: EpisodeReasonCoverage[];
  reasonStats: EpisodeReasonStat[];
  dataAuditPassed: boolean | null;
}

export interface EpisodeReasonStat {
  model: string;
  category: EpisodeTradeReasonCategory;
  actions: number;
  actionBreakdown: Record<string, number>;
  entries: number;
  trades: number;
  wins: number;
  winRate: number | null;
  averageNetR: number | null;
  totalNetR: number;
}

export interface EpisodeReasonCoverage {
  model: string;
  reasonedActions: number;
  decisionActions: number;
  coverage: number | null;
}

interface ReportRow {
  answer: EpisodeAnswer;
  question: Question | undefined;
  trace: EpisodeReportTraceLine[];
  processEvents: ProcessEvent[];
  directionHit: boolean | null;
  horizonDirection: 'long' | 'short' | 'flat' | null;
  plannedRr: number | null;
  stopDistancePct: number | null;
  captureRate: number | null;
  provenance?: EpisodeProvenanceEntry;
}

function formatProvenanceLine(prov: EpisodeProvenanceEntry): string {
  const parts = [`Source: ${prov.sourceSymbol} @ ${prov.sourceCutoff.slice(0, 10)}`];
  if (prov.dayShift != null) parts.push(`shift +${prov.dayShift}d`);
  if (prov.priceScale != null && Number.isFinite(prov.priceScale)) {
    parts.push(`price ×${prov.priceScale.toFixed(2)}`);
  }
  return parts.join(' · ');
}

interface AggregateMetrics {
  cases: number;
  completed: number;
  completionRate: number;
  directional: number;
  participationRate: number | null;
  filled: number;
  trades: number;
  fillRate: number | null;
  wins: number;
  winRate: number | null;
  tradeWins: number;
  tradeWinRate: number | null;
  avgNetRPerCase: number | null;
  expectancy: number | null;
  totalNetR: number;
  profitFactor: number | 'infinite' | null;
  directionAccuracy: number | null;
  avgHoldingBars: number | null;
  avgMfeR: number | null;
  avgMaeR: number | null;
  avgCaptureRate: number | null;
  avgMaxDrawdownR: number | null;
  avgCostUsd: number | null;
  avgDurationMs: number | null;
  avgToolCalls: number | null;
  avgTokens: number | null;
  avgDecisionBars: number | null;
}

type ChartTimeframe = 'h1' | 'day' | 'week';

const CHART_TIMEFRAME_ORDER: ChartTimeframe[] = ['h1', 'day', 'week'];
const CHART_TIMEFRAME_KLINE_KEY: Record<ChartTimeframe, '1h' | 'day' | 'week'> = {
  h1: '1h',
  day: 'day',
  week: 'week',
};
const CHART_TIMEFRAME_LABEL: Record<ChartTimeframe, string> = {
  h1: '1 小时',
  day: '日线',
  week: '周线',
};

function availableTimeframesFor(question: Question | null | undefined): ChartTimeframe[] {
  if (!question) return [];
  const kl = question.fixtures.kline as Record<string, unknown[] | undefined>;
  return CHART_TIMEFRAME_ORDER.filter((tf) => {
    const bars = kl[CHART_TIMEFRAME_KLINE_KEY[tf]];
    return Array.isArray(bars) && bars.length > 0;
  });
}

interface ChartBar {
  time: number | string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ChartMarker {
  time: number | string;
  position: 'aboveBar' | 'belowBar';
  color: string;
  shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square';
  text: string;
}

interface ChartPayload {
  id: string;
  symbol: string;
  finalBarIndex: number;
  baseRanges: Record<ChartTimeframe, ChartBar[]>;
  replayH1: ChartBar[];
  snapshotPatches: Record<string, { day: ChartBar[]; week: ChartBar[] }>;
  markers: Record<ChartTimeframe, ChartMarker[]>;
  levels: Array<{ title: string; price: number; color: string }>;
  availableTimeframes: ChartTimeframe[];
  defaultTimeframe: ChartTimeframe;
}

type ProcessKind = 'data' | 'observe' | 'decision' | 'manage' | 'warning' | 'other';

interface ProcessEvent {
  sequence: number;
  tool: string;
  label: string;
  detail: string;
  kind: ProcessKind;
  barBefore: number;
  barAfter: number;
  snapshotBar: number;
  timeframe: ChartTimeframe | null;
  phaseBefore: string | null;
  phaseAfter: string | null;
  durationMs: number | null;
  isError: boolean;
}

const TERMINATION_LABELS: Record<string, string> = {
  abstain: '观望',
  no_decision: '未决策',
  cancelled: '取消订单',
  no_fill: '未成交',
  stop: '止损',
  target: '止盈',
  manual: '主动退出',
  horizon: '到期平仓',
  no_trade: '全程空仓',
};

const DIRECTION_LABELS: Record<string, string> = { long: '做多', short: '做空', neutral: '观望' };
const MODE_LABELS: Record<string, string> = { blind: '盲盘', live: '实盘' };
const REASON_LABELS: Record<EpisodeTradeReasonCategory, string> = {
  trend_following: '趋势跟随',
  breakout: '突破',
  pullback: '回调入场',
  mean_reversion: '均值回归',
  support_resistance: '支撑阻力',
  momentum: '动量',
  volume_flow: '量价与资金流',
  volatility: '波动率',
  news_event: '新闻事件',
  fundamental: '基本面',
  risk_management: '风险管理',
  thesis_invalidated: '逻辑失效',
  profit_protection: '利润保护',
  time_horizon: '时间窗口',
  no_setup: '无有效机会',
  other: '其他',
};
const ACTION_LABELS: Record<string, string> = {
  submit: '提交',
  hold: '持有',
  amend: '改单',
  cancel: '撤单',
  exit_next_open: '主动退出',
};
const EVENT_LABELS: Record<string, string> = {
  observed: '已公开下一根',
  decision_due: '决策窗口即将截止',
  no_decision: '决策窗口已截止',
  waiting_fill: '挂单等待成交',
  filled: '订单已成交',
  holding: '继续持仓',
  amended: '计划已调整',
  cancelled: '订单已取消',
  target_hit: '止盈命中',
  stop_hit: '止损命中',
  manual_exit: '主动退出',
  horizon_exit: '回放到期退出',
  abstained: '选择观望',
};

const MARKET_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function serializeForScript(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

function finite(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mean(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((value): value is number => value != null && Number.isFinite(value));
  return valid.length > 0 ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function fmt(value: number | null | undefined, digits = 2): string {
  return value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits);
}

function fmtSigned(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
}

function fmtPercent(value: number | null | undefined, digits = 1): string {
  return value == null || !Number.isFinite(value) ? '—' : `${(value * 100).toFixed(digits)}%`;
}

function fmtUsd(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '—' : `$${value.toFixed(value < 1 ? 3 : 2)}`;
}

function fmtDuration(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value < 1_000 ? `${Math.round(value)} ms` : `${(value / 1_000).toFixed(1)} s`;
}

function horizonDirection(question: Question | undefined): ReportRow['horizonDirection'] {
  if (!question) return null;
  const initial = finite((question.fixtures.quote as { last?: unknown }).last);
  const final = finite(question.replay.bars.at(-1)?.close);
  if (initial == null || final == null) return null;
  if (Math.abs(final - initial) < 1e-9) return 'flat';
  return final > initial ? 'long' : 'short';
}

function plannedRr(answer: EpisodeAnswer): number | null {
  const plan = answer.initialSubmission?.entry_plan;
  const direction = answer.initialSubmission?.direction;
  if (!plan || plan.target1 == null || direction === 'neutral' || direction == null) return null;
  const risk = Math.abs(plan.entry - plan.stop);
  if (risk <= 0) return null;
  const reward = direction === 'long' ? plan.target1 - plan.entry : plan.entry - plan.target1;
  return reward / risk;
}

function distancePct(a: number | undefined, b: number | undefined): number | null {
  return a == null || b == null || a === 0 ? null : Math.abs(a - b) / Math.abs(a);
}

function nonNegativeInteger(value: unknown): number | null {
  const parsed = finite(value);
  return parsed != null && Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function parseResultSummary(line: EpisodeReportTraceLine): Record<string, unknown> | null {
  if (!line.resultSummary) return null;
  try {
    const parsed = JSON.parse(line.resultSummary) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function summaryNumber(line: EpisodeReportTraceLine, key: string): number | null {
  const parsed = parseResultSummary(line);
  const direct = nonNegativeInteger(parsed?.[key]);
  if (direct != null) return direct;
  const match = line.resultSummary?.match(new RegExp(`"${key}"\\s*:\\s*(\\d+)`));
  return match ? nonNegativeInteger(match[1]) : null;
}

function summaryString(line: EpisodeReportTraceLine, key: string): string | null {
  const parsed = parseResultSummary(line);
  if (typeof parsed?.[key] === 'string') return parsed[key];
  const match = line.resultSummary?.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`));
  return match?.[1] ?? null;
}

function summaryBoolean(line: EpisodeReportTraceLine, key: string): boolean | null {
  const parsed = parseResultSummary(line);
  if (typeof parsed?.[key] === 'boolean') return parsed[key];
  const match = line.resultSummary?.match(new RegExp(`"${key}"\\s*:\\s*(true|false)`));
  return match ? match[1] === 'true' : null;
}

function traceTimeframe(value: unknown): ChartTimeframe | null {
  return value === 'h1' || value === 'day' || value === 'week' ? value : null;
}

function toolKind(name: string): ProcessKind {
  if (
    name === 'fetch_kline' ||
    name === 'read_data_pack' ||
    name === 'fetch_news' ||
    name === 'run_code'
  )
    return 'data';
  if (name === 'observe_next_bar') return 'observe';
  if (name === 'submit_prediction') return 'decision';
  if (name === 'advance_trade') return 'manage';
  return 'other';
}

function inferPhaseAfter(line: EpisodeReportTraceLine, current: string): string {
  if (line.contextAfter?.phase) return line.contextAfter.phase;
  if (summaryBoolean(line, 'terminal')) return 'terminal';
  if (line.name === 'submit_prediction') {
    return summaryString(line, 'event') === 'abstained' ? 'flat' : 'pending';
  }
  if (line.name === 'advance_trade') {
    const result = line.resultSummary ?? '';
    if (/"position"\s*:\s*{/.test(result)) return 'position';
    if (/"order"\s*:\s*{/.test(result)) return 'waiting_fill';
  }
  return current;
}

function inferBarAfter(line: EpisodeReportTraceLine, before: number): number {
  const contextual = nonNegativeInteger(line.contextAfter?.barIndex);
  if (contextual != null) return contextual;
  const summarized = summaryNumber(line, 'barIndex');
  if (summarized != null) return summarized;
  if (
    (line.name === 'observe_next_bar' || line.name === 'advance_trade') &&
    /"bar"\s*:\s*{/.test(line.resultSummary ?? '')
  )
    return before + 1;
  return before;
}

function traceReason(args: Record<string, unknown>): EpisodeTradeReason | null {
  const candidate = (args.decision_reason ?? args.reason) as Record<string, unknown> | undefined;
  if (!candidate || typeof candidate !== 'object') return null;
  if (typeof candidate.category !== 'string' || typeof candidate.summary !== 'string') return null;
  return candidate as EpisodeTradeReason;
}

function reasonDetail(args: Record<string, unknown>): string | null {
  const reason = traceReason(args);
  if (!reason) return null;
  const label = REASON_LABELS[reason.category] ?? reason.category;
  return `${label}：${reason.summary}`;
}

function processLabel(line: EpisodeReportTraceLine): {
  label: string;
  detail: string;
  timeframe: ChartTimeframe | null;
} {
  const name = line.name ?? 'unknown_tool';
  const args = line.args ?? {};
  const event = summaryString(line, 'event');
  const eventText = event ? (EVENT_LABELS[event] ?? event) : null;
  if (name === 'read_data_pack')
    return { label: '读取数据包', detail: '查看当前多周期摘要', timeframe: null };
  if (name === 'fetch_news')
    return { label: '读取新闻', detail: '查看当前时点以前的新闻', timeframe: null };
  if (name === 'run_code')
    return { label: '运行计算', detail: '基于当前可见数据计算', timeframe: null };
  if (name === 'fetch_kline') {
    const timeframe = traceTimeframe(args.period);
    const period =
      timeframe === 'h1'
        ? '1 小时'
        : timeframe === 'day'
          ? '日线'
          : timeframe === 'week'
            ? '周线'
            : 'K 线';
    const count = nonNegativeInteger(args.count);
    return {
      label: `${period}${count == null ? '' : ` × ${count}`}`,
      detail: '只读，不推进回放',
      timeframe,
    };
  }
  if (name === 'observe_next_bar') {
    return {
      label: '观察下一根',
      detail: eventText ? `回放事件：${eventText}` : '公开一根 1 小时 K 线',
      timeframe: 'h1',
    };
  }
  if (name === 'submit_prediction') {
    const direction =
      typeof args.direction === 'string'
        ? (DIRECTION_LABELS[args.direction] ?? args.direction)
        : '未知方向';
    const reason = reasonDetail(args);
    return {
      label: `交易计划 · ${direction}`,
      detail: reason ?? (eventText ? `引擎事件：${eventText}` : '空仓时提交计划，可在后续重新入场'),
      timeframe: 'h1',
    };
  }
  if (name === 'advance_trade') {
    const action = typeof args.type === 'string' ? args.type.toUpperCase() : 'ACTION';
    const reason = reasonDetail(args);
    return {
      label: `推进 · ${action}`,
      detail: reason ?? (eventText ? `引擎事件：${eventText}` : '提交管理动作并公开下一根'),
      timeframe: 'h1',
    };
  }
  return { label: name, detail: '工具调用', timeframe: null };
}

function buildProcessEvents(trace: EpisodeReportTraceLine[]): ProcessEvent[] {
  const events: ProcessEvent[] = [];
  let inferredBar = 0;
  let inferredPhase = 'flat';
  for (const line of trace) {
    if (line.type === 'prompt_context' && line.warningInjected === true) {
      const bar = nonNegativeInteger(line.barIndex) ?? inferredBar;
      const remaining = nonNegativeInteger(line.remainingBars) ?? 0;
      const phase = line.phase ?? inferredPhase;
      events.push({
        sequence: events.length + 1,
        tool: 'message_engine',
        label: `T-${remaining} 强平提醒`,
        detail:
          remaining === 1 ? '下一根为最后一根，随后强制结算' : `距离强制结算还有 ${remaining} 根`,
        kind: 'warning',
        barBefore: bar,
        barAfter: bar,
        snapshotBar: bar,
        timeframe: 'h1',
        phaseBefore: phase,
        phaseAfter: phase,
        durationMs: null,
        isError: false,
      });
      inferredBar = bar;
      inferredPhase = phase;
      continue;
    }
    if (line.type !== 'tool_call' || !line.name) continue;
    const contextualBefore = nonNegativeInteger(line.contextBefore?.barIndex);
    const barBefore = contextualBefore ?? inferredBar;
    const barAfter = inferBarAfter(line, barBefore);
    const phaseBefore = line.contextBefore?.phase ?? inferredPhase;
    const phaseAfter = inferPhaseAfter(line, phaseBefore);
    const presentation = processLabel(line);
    events.push({
      sequence: events.length + 1,
      tool: line.name,
      label: presentation.label,
      detail: presentation.detail,
      kind: toolKind(line.name),
      barBefore,
      barAfter,
      snapshotBar:
        line.name === 'observe_next_bar' || line.name === 'advance_trade' ? barAfter : barBefore,
      timeframe: presentation.timeframe,
      phaseBefore,
      phaseAfter,
      durationMs: finite(line.durationMs),
      isError: line.isError === true || /^rejected:/i.test(line.resultSummary ?? ''),
    });
    inferredBar = barAfter;
    inferredPhase = phaseAfter;
  }
  return events;
}

function decisionBar(answer: EpisodeAnswer): number | null {
  if (answer.result?.decisionBar !== undefined) return answer.result.decisionBar ?? null;
  return answer.initialSubmission ? 0 : null;
}

function observationBars(answer: EpisodeAnswer): number {
  return (
    answer.result?.observationBars ??
    answer.result?.actions.filter((action) => action.action.type === 'observe').length ??
    0
  );
}

function closedTrades(answer: EpisodeAnswer): EpisodeClosedTrade[] {
  const result = answer.result;
  if (!result) return [];
  if (result.trades) return result.trades;
  if (!result.entry || !result.exit || result.initialRisk == null || result.direction === 'neutral')
    return [];
  const exitReason =
    result.terminationReason === 'stop' ||
    result.terminationReason === 'target' ||
    result.terminationReason === 'manual'
      ? result.terminationReason
      : 'horizon';
  const plan = answer.initialSubmission?.entry_plan;
  const inferredStop =
    result.direction === 'long'
      ? result.entry.price - result.initialRisk
      : result.entry.price + result.initialRisk;
  return [
    {
      tradeId: 1,
      direction: result.direction,
      decisionBar: decisionBar(answer) ?? 0,
      decisionTime:
        result.decisionTime ?? answer.initialSubmission?.anchor.time ?? result.entry.time,
      entry: result.entry,
      exit: result.exit,
      exitReason,
      initialStop: plan?.stop ?? inferredStop,
      finalStop: plan?.stop ?? inferredStop,
      target: plan?.target1 ?? result.exit.price,
      initialRisk: result.initialRisk,
      grossR: result.grossR ?? 0,
      frictionR: result.frictionR ?? 0,
      netR: result.netR ?? 0,
      mfeR: result.mfeR ?? 0,
      maeR: result.maeR ?? 0,
      holdingBars: result.holdingBars,
    },
  ];
}

function tradeExitLabel(trade: EpisodeClosedTrade): string {
  const sameOpen =
    trade.entry.time === trade.exit.time && Math.abs(trade.entry.price - trade.exit.price) < 1e-9;
  const crossedAtFill =
    sameOpen &&
    (trade.exitReason === 'target'
      ? trade.direction === 'long'
        ? trade.entry.price >= trade.target
        : trade.entry.price <= trade.target
      : trade.exitReason === 'stop'
        ? trade.direction === 'long'
          ? trade.entry.price <= trade.initialStop
          : trade.entry.price >= trade.initialStop
        : false);
  if (trade.exitReason === 'target') return crossedAtFill ? '止盈（开盘越过）' : '止盈';
  if (trade.exitReason === 'stop') return crossedAtFill ? '止损（开盘越过）' : '止损';
  if (trade.exitReason === 'manual') return '主动退出';
  return '强平';
}

function replayBarIndex(question: Question | undefined, time: string | undefined): number | null {
  if (!question || !time) return null;
  const index = question.replay.bars.findIndex((bar) => bar.time === time);
  return index >= 0 ? index + 1 : null;
}

function buildRows(
  answers: EpisodeAnswer[],
  questions: Map<string, Question>,
  traces: Map<string, EpisodeReportTraceLine[]> = new Map(),
  provenance: Map<string, EpisodeProvenanceEntry> = new Map(),
): ReportRow[] {
  return answers.map((answer) => {
    const question = questions.get(answer.questionId);
    const trace = traces.get(answer.traceRef) ?? [];
    const direction = answer.initialSubmission?.direction;
    const horizon = horizonDirection(question);
    const directionHit =
      direction === 'long' || direction === 'short'
        ? horizon === 'flat' || horizon == null
          ? null
          : direction === horizon
        : null;
    const mfe = answer.result?.mfeR;
    const net = answer.result?.netR;
    return {
      answer,
      question,
      trace,
      processEvents: buildProcessEvents(trace),
      directionHit,
      horizonDirection: horizon,
      plannedRr: plannedRr(answer),
      stopDistancePct: distancePct(
        answer.initialSubmission?.entry_plan?.entry,
        answer.initialSubmission?.entry_plan?.stop,
      ),
      captureRate: mfe != null && mfe > 0 && net != null ? net / mfe : null,
      provenance: provenance.get(answer.questionId),
    };
  });
}

function aggregate(rows: ReportRow[]): AggregateMetrics {
  const completed = rows.filter((row) => row.answer.status === 'completed');
  const directional = completed.filter((row) => {
    const direction = row.answer.initialSubmission?.direction;
    return direction === 'long' || direction === 'short';
  });
  const filled = completed.filter((row) => closedTrades(row.answer).length > 0);
  const episodeNetValues = completed.map((row) => row.answer.result?.netR ?? 0);
  const positiveEpisodes = episodeNetValues.filter((value) => value > 0);
  const trades = completed.flatMap((row) => closedTrades(row.answer));
  const tradeNetValues = trades.map((trade) => trade.netR);
  const positiveTrades = tradeNetValues.filter((value) => value > 0);
  const grossProfit = positiveTrades.reduce((sum, value) => sum + value, 0);
  const grossLoss = Math.abs(
    tradeNetValues.filter((value) => value < 0).reduce((sum, value) => sum + value, 0),
  );
  const directionRows = directional.filter((row) => row.directionHit != null);
  return {
    cases: rows.length,
    completed: completed.length,
    completionRate: ratio(completed.length, rows.length) ?? 0,
    directional: directional.length,
    participationRate: ratio(directional.length, completed.length),
    filled: filled.length,
    trades: trades.length,
    fillRate: ratio(filled.length, directional.length),
    wins: positiveEpisodes.length,
    winRate: ratio(positiveEpisodes.length, completed.length),
    tradeWins: positiveTrades.length,
    tradeWinRate: ratio(positiveTrades.length, trades.length),
    avgNetRPerCase: mean(completed.map((row) => row.answer.result?.netR ?? 0)),
    expectancy: mean(tradeNetValues),
    totalNetR: episodeNetValues.reduce((sum, value) => sum + value, 0),
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 'infinite' : null,
    directionAccuracy:
      directionRows.length > 0
        ? directionRows.filter((row) => row.directionHit).length / directionRows.length
        : null,
    avgHoldingBars: mean(trades.map((trade) => trade.holdingBars)),
    avgMfeR: mean(trades.map((trade) => trade.mfeR)),
    avgMaeR: mean(trades.map((trade) => trade.maeR)),
    avgCaptureRate: mean(filled.map((row) => row.captureRate)),
    avgMaxDrawdownR: mean(completed.map((row) => row.answer.result?.maxDrawdownR)),
    avgCostUsd: mean(rows.map((row) => row.answer.metrics.costUsd)),
    avgDurationMs: mean(rows.map((row) => row.answer.metrics.durationMs)),
    avgToolCalls: mean(rows.map((row) => row.answer.metrics.toolCalls)),
    avgTokens: mean(
      rows.map((row) => row.answer.metrics.inputTokens + row.answer.metrics.outputTokens),
    ),
    avgDecisionBars: mean(completed.map((row) => decisionBar(row.answer))),
  };
}

function actionReason(record: EpisodeActionRecord): EpisodeTradeReason | null {
  return 'reason' in record.action ? (record.action.reason ?? null) : null;
}

function isDecisionAction(record: EpisodeActionRecord): boolean {
  return record.action.type !== 'observe';
}

function tradeEntryReason(row: ReportRow, trade: EpisodeClosedTrade): EpisodeTradeReason | null {
  if (trade.entryReason) return trade.entryReason;
  const submitted = row.answer.result?.actions.find(
    (record) => record.tradeId === trade.tradeId && record.action.type === 'submit',
  );
  return submitted ? actionReason(submitted) : null;
}

interface ReasonMetrics {
  decisionActions: number;
  reasonedActions: number;
  coverage: number | null;
  coverageByModel: EpisodeReasonCoverage[];
  stats: EpisodeReasonStat[];
}

function aggregateReasons(rows: ReportRow[]): ReasonMetrics {
  const completed = rows.filter((row) => row.answer.status === 'completed');
  const actions = completed.flatMap((row) =>
    (row.answer.result?.actions ?? [])
      .filter(isDecisionAction)
      .map((record) => ({ model: row.answer.model, record })),
  );
  const reasoned = actions.flatMap(({ model, record }) => {
    const reason = actionReason(record);
    return reason ? [{ model, record, reason }] : [];
  });
  const byCategory = new Map<string, EpisodeReasonStat>();
  const ensure = (model: string, category: EpisodeTradeReasonCategory): EpisodeReasonStat => {
    const key = `${model}\u0000${category}`;
    const existing = byCategory.get(key);
    if (existing) return existing;
    const created: EpisodeReasonStat = {
      model,
      category,
      actions: 0,
      actionBreakdown: {},
      entries: 0,
      trades: 0,
      wins: 0,
      winRate: null,
      averageNetR: null,
      totalNetR: 0,
    };
    byCategory.set(key, created);
    return created;
  };

  for (const { model, record, reason } of reasoned) {
    const stat = ensure(model, reason.category);
    stat.actions += 1;
    stat.actionBreakdown[record.action.type] = (stat.actionBreakdown[record.action.type] ?? 0) + 1;
    if (record.action.type === 'submit' && record.tradeId != null) stat.entries += 1;
  }

  const netByCategory = new Map<string, number[]>();
  for (const row of completed) {
    for (const trade of closedTrades(row.answer)) {
      const reason = tradeEntryReason(row, trade);
      if (!reason) continue;
      const stat = ensure(row.answer.model, reason.category);
      stat.trades += 1;
      if (trade.netR > 0) stat.wins += 1;
      stat.totalNetR += trade.netR;
      const key = `${row.answer.model}\u0000${reason.category}`;
      netByCategory.set(key, [...(netByCategory.get(key) ?? []), trade.netR]);
    }
  }

  for (const [key, values] of netByCategory) {
    const stat = byCategory.get(key);
    if (!stat) continue;
    stat.winRate = ratio(stat.wins, stat.trades);
    stat.averageNetR = mean(values);
  }

  const models = [...new Set(actions.map((entry) => entry.model))].sort();
  const coverageByModel = models.map((model) => {
    const modelActions = actions.filter((entry) => entry.model === model).length;
    const modelReasoned = reasoned.filter((entry) => entry.model === model).length;
    return {
      model,
      reasonedActions: modelReasoned,
      decisionActions: modelActions,
      coverage: ratio(modelReasoned, modelActions),
    };
  });

  return {
    decisionActions: actions.length,
    reasonedActions: reasoned.length,
    coverage: ratio(reasoned.length, actions.length),
    coverageByModel,
    stats: [...byCategory.values()].sort(
      (a, b) =>
        a.model.localeCompare(b.model) ||
        b.actions - a.actions ||
        b.trades - a.trades ||
        a.category.localeCompare(b.category),
    ),
  };
}

function valueClass(value: number | null | undefined): string {
  if (value == null || value === 0) return 'neutral';
  return value > 0 ? 'positive' : 'negative';
}

function marketDate(time: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(time)) return time;
  const parts = MARKET_DATE_FORMATTER.formatToParts(new Date(time));
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function weekKey(time: string): string {
  const date = marketDate(time);
  const value = new Date(`${date}T00:00:00Z`);
  const day = value.getUTCDay();
  value.setUTCDate(value.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return value.toISOString().slice(0, 10);
}

function chartTime(time: string, timeframe: ChartTimeframe): number | string {
  return timeframe === 'h1'
    ? Math.floor(Date.parse(time) / 1_000)
    : timeframe === 'day'
      ? marketDate(time)
      : weekKey(time);
}

function toChartBar(bar: RawBar, timeframe: ChartTimeframe): ChartBar | null {
  const open = finite(bar.open);
  const high = finite(bar.high);
  const low = finite(bar.low);
  const close = finite(bar.close);
  const volume = finite(bar.volume);
  const time = chartTime(bar.time, timeframe);
  if (open == null || high == null || low == null || close == null || volume == null) return null;
  if (typeof time === 'number' && !Number.isFinite(time)) return null;
  return { time, open, high, low, close, volume };
}

function toChartBars(bars: RawBar[], timeframe: ChartTimeframe): ChartBar[] {
  const deduped = new Map<string, ChartBar>();
  for (const bar of bars) {
    const converted = toChartBar(bar, timeframe);
    if (converted) deduped.set(String(converted.time), converted);
  }
  return [...deduped.values()].sort((a, b) => {
    if (typeof a.time === 'number' && typeof b.time === 'number') return a.time - b.time;
    return String(a.time).localeCompare(String(b.time));
  });
}

function visibleCursor(row: ReportRow): number {
  if (!row.question) return -1;
  const times = new Set(
    (row.answer.result?.actions ?? [])
      .map((action) => action.effectiveBarTime)
      .filter((time): time is string => time != null),
  );
  let cursor = -1;
  row.question.replay.bars.forEach((bar, index) => {
    if (times.has(bar.time)) cursor = index;
  });
  return cursor;
}

function rangesAtBarIndex(
  question: Question,
  barIndex: number,
): Record<ChartTimeframe, ChartBar[]> {
  const clamped = Math.max(0, Math.min(question.replay.bars.length, Math.floor(barIndex)));
  const view = buildEpisodeQuestionViewAtCursor(question, clamped - 1);
  return {
    h1: toChartBars(view.fixtures.kline['1h'] ?? [], 'h1'),
    day: toChartBars(view.fixtures.kline.day ?? [], 'day'),
    week: toChartBars(view.fixtures.kline.week ?? [], 'week'),
  };
}

function finalVisibleBarIndex(row: ReportRow): number {
  if (!row.question) return 0;
  if (
    row.answer.status === 'completed' &&
    (row.answer.result?.terminationReason === 'horizon' ||
      row.answer.result?.terminationReason === 'no_trade')
  ) {
    return row.question.replay.bars.length;
  }
  const fromActions = visibleCursor(row) + 1;
  const fromTrace = row.processEvents.reduce(
    (maximum, event) => Math.max(maximum, event.snapshotBar),
    0,
  );
  return Math.max(0, Math.min(row.question.replay.bars.length, Math.max(fromActions, fromTrace)));
}

function changedChartBars(previous: ChartBar[], current: ChartBar[]): ChartBar[] {
  const prior = new Map(previous.map((bar) => [String(bar.time), bar]));
  return current.filter((bar) => {
    const before = prior.get(String(bar.time));
    return (
      !before ||
      before.open !== bar.open ||
      before.high !== bar.high ||
      before.low !== bar.low ||
      before.close !== bar.close ||
      before.volume !== bar.volume
    );
  });
}

function buildChartPayload(row: ReportRow, index: number): ChartPayload | null {
  if (!row.question) return null;
  const finalBarIndex = finalVisibleBarIndex(row);
  const baseRanges = rangesAtBarIndex(row.question, 0);
  const finalRanges = rangesAtBarIndex(row.question, finalBarIndex);
  const replayH1 = finalRanges.h1.slice(baseRanges.h1.length);
  const snapshotPatches: ChartPayload['snapshotPatches'] = {};
  let previousRanges = baseRanges;
  for (let barIndex = 1; barIndex <= finalBarIndex; barIndex += 1) {
    const currentRanges = rangesAtBarIndex(row.question, barIndex);
    snapshotPatches[String(barIndex)] = {
      day: changedChartBars(previousRanges.day, currentRanges.day),
      week: changedChartBars(previousRanges.week, currentRanges.week),
    };
    previousRanges = currentRanges;
  }
  const trades = closedTrades(row.answer);
  const markers = { h1: [], day: [], week: [] } as Record<ChartTimeframe, ChartMarker[]>;
  const availableTf = availableTimeframesFor(row.question);
  const firstReplay = row.question.replay.bars[0];
  const finalReplay = row.question.replay.bars.at(finalBarIndex - 1);
  for (const tf of availableTf) {
    const key = CHART_TIMEFRAME_KLINE_KEY[tf];
    const bars = row.question.fixtures.kline[key] ?? [];
    const caseStartBar = bars.at(-1);
    if (caseStartBar) {
      markers[tf].push({
        time: chartTime(caseStartBar.time, tf),
        position: 'belowBar',
        color: '#171717',
        shape: 'square',
        text: 'CASE START · B0',
      });
    }
    if (firstReplay && finalBarIndex >= 1) {
      markers[tf].push({
        time: chartTime(firstReplay.time, tf),
        position: 'belowBar',
        color: '#737373',
        shape: 'circle',
        text: 'B1 · 首根回放',
      });
    }
    if (finalReplay && finalBarIndex === row.question.replay.bars.length) {
      markers[tf].push({
        time: chartTime(finalReplay.time, tf),
        position: 'aboveBar',
        color: '#171717',
        shape: 'square',
        text: `B${finalBarIndex} · 强制结算`,
      });
    }
    for (const trade of trades) {
      const decisionSourceForTrade =
        trade.decisionBar === 0
          ? caseStartBar
          : row.question.replay.bars[trade.decisionBar - 1];
      if (decisionSourceForTrade && trade.decisionBar <= finalBarIndex) {
        markers[tf].push({
          time: chartTime(decisionSourceForTrade.time, tf),
          position: trade.direction === 'short' ? 'aboveBar' : 'belowBar',
          color: '#7c3aed',
          shape: trade.direction === 'short' ? 'arrowDown' : 'arrowUp',
          text: `T${trade.tradeId} 决策 B${trade.decisionBar}`,
        });
      }
    }
  }
  for (const timeframe of ['h1', 'day', 'week'] as const) {
    const available = new Set(finalRanges[timeframe].map((bar) => String(bar.time)));
    for (const trade of trades) {
      const entryTime = chartTime(trade.entry.time, timeframe);
      if (available.has(String(entryTime))) {
        markers[timeframe].push({
          time: entryTime,
          position: trade.direction === 'short' ? 'aboveBar' : 'belowBar',
          color: '#2563eb',
          shape: trade.direction === 'short' ? 'arrowDown' : 'arrowUp',
          text: `T${trade.tradeId} 成交 ${fmt(trade.entry.price)} · S ${fmt(trade.initialStop)} · T ${fmt(trade.target)}`,
        });
      }
      const exitTime = chartTime(trade.exit.time, timeframe);
      const exitLabel = tradeExitLabel(trade);
      if (available.has(String(exitTime))) {
        markers[timeframe].push({
          time: exitTime,
          position: trade.direction === 'short' ? 'belowBar' : 'aboveBar',
          color: trade.netR >= 0 ? '#059669' : '#dc2626',
          shape: 'circle',
          text: `T${trade.tradeId} ${exitLabel} ${fmt(trade.exit.price)} · ${fmtSigned(trade.netR, 2)}R`,
        });
      }
    }
    markers[timeframe].sort((a, b) => String(a.time).localeCompare(String(b.time)));
  }
  const plan = row.answer.initialSubmission?.entry_plan;
  const levels: ChartPayload['levels'] = [];
  if (plan?.entry != null) levels.push({ title: '计划入场', price: plan.entry, color: '#2563eb' });
  if (plan?.stop != null) levels.push({ title: '止损', price: plan.stop, color: '#dc2626' });
  if (plan?.target1 != null) levels.push({ title: '止盈', price: plan.target1, color: '#059669' });
  const availableTimeframes = availableTimeframesFor(row.question);
  const defaultTimeframe = availableTimeframes[0] ?? 'day';
  return {
    id: `trade-chart-${index}`,
    symbol: row.answer.symbol,
    finalBarIndex,
    baseRanges,
    replayH1,
    snapshotPatches,
    markers,
    levels,
    availableTimeframes,
    defaultTimeframe,
  };
}

function metricCell(label: string, value: string, note: string, tone = 'neutral'): string {
  return `<div class="metric ${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></div>`;
}

function renderReasonTable(rows: ReportRow[]): string {
  const metrics = aggregateReasons(rows);
  const coverage = metrics.coverage == null ? '—' : fmtPercent(metrics.coverage);
  if (metrics.stats.length === 0) {
    return `<section class="panel reason-panel"><div class="panel-title"><h2>交易原因统计</h2><span>理由覆盖 ${metrics.reasonedActions}/${metrics.decisionActions} · ${coverage}</span></div><p class="reason-empty">该运行没有结构化交易理由；历史结果仍可读取，但不进入原因表现统计。</p></section>`;
  }
  return `<section class="panel reason-panel"><div class="panel-title"><h2>交易原因统计</h2><span>理由覆盖 ${metrics.reasonedActions}/${metrics.decisionActions} · ${coverage}</span></div>
    <div class="table-scroll"><table class="compact-table reason-table"><thead><tr><th>模型</th><th>主原因</th><th>动作</th><th>入场 / 成交</th><th>胜率</th><th>AVG NET R</th><th>TOTAL NET R</th></tr></thead><tbody>${metrics.stats
      .map((stat) => {
        const breakdown = Object.entries(stat.actionBreakdown)
          .map(([action, count]) => `${ACTION_LABELS[action] ?? action} ${count}`)
          .join(' · ');
        return `<tr><td><strong>${escapeHtml(stat.model)}</strong></td><td><strong>${escapeHtml(REASON_LABELS[stat.category])}</strong><small>${escapeHtml(stat.category)}</small></td><td><strong>${stat.actions}</strong><small>${escapeHtml(breakdown || '—')}</small></td><td>${stat.entries} / ${stat.trades}</td><td>${fmtPercent(stat.winRate)}</td><td class="mono ${valueClass(stat.averageNetR)}">${fmtSigned(stat.averageNetR, 3)}</td><td class="mono ${valueClass(stat.totalNetR)}">${fmtSigned(stat.totalNetR, 3)}</td></tr>`;
      })
      .join('')}</tbody></table></div></section>`;
}

function renderModelTable(rows: ReportRow[]): string {
  const groups = new Map<string, ReportRow[]>();
  for (const row of rows)
    groups.set(row.answer.model, [...(groups.get(row.answer.model) ?? []), row]);
  const models = [...groups.entries()]
    .map(([model, modelRows]) => ({ model, metrics: aggregate(modelRows) }))
    .sort(
      (a, b) => (b.metrics.avgNetRPerCase ?? -Infinity) - (a.metrics.avgNetRPerCase ?? -Infinity),
    );
  return `<section class="panel model-panel"><div class="panel-title"><h2>模型汇总</h2><span>按平均净 R / case 排序</span></div>
    <div class="table-scroll"><table class="compact-table"><thead><tr><th>#</th><th>模型</th><th>CASE / TRADE</th><th>AVG NET R</th><th>EPISODE / 交易胜率</th><th>方向命中</th><th>成交率</th><th>成本</th></tr></thead>
    <tbody>${models.map((entry, index) => `<tr><td>${index + 1}</td><td><strong>${escapeHtml(entry.model)}</strong></td><td>${entry.metrics.cases} / ${entry.metrics.trades}</td><td class="mono ${valueClass(entry.metrics.avgNetRPerCase)}">${fmtSigned(entry.metrics.avgNetRPerCase, 3)}</td><td>${fmtPercent(entry.metrics.winRate)} / ${fmtPercent(entry.metrics.tradeWinRate)}</td><td>${fmtPercent(entry.metrics.directionAccuracy)}</td><td>${fmtPercent(entry.metrics.fillRate)}</td><td>${fmtUsd(entry.metrics.avgCostUsd)}</td></tr>`).join('')}</tbody></table></div></section>`;
}

function renderCasesTable(rows: ReportRow[]): string {
  const models = [...new Set(rows.map((row) => row.answer.model))].sort();
  const modes = [...new Set(rows.map((row) => row.answer.mode))].sort();
  const outcomes = [
    ...new Set(rows.map((row) => row.answer.result?.terminationReason ?? row.answer.status)),
  ].sort();
  return `<section class="panel cases-panel"><div class="panel-title"><h2>Case 列表</h2><span>选择记录查看三周期 K 线和交易标注</span></div>
    <div class="filters"><select id="model-filter" aria-label="模型"><option value="">全部模型</option>${models.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('')}</select><select id="mode-filter" aria-label="模式"><option value="">全部模式</option>${modes.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(MODE_LABELS[value] ?? value)}</option>`).join('')}</select><select id="outcome-filter" aria-label="结果"><option value="">全部结果</option>${outcomes.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(TERMINATION_LABELS[value] ?? value)}</option>`).join('')}</select><input id="case-search" type="search" placeholder="搜索 symbol / case id"/><span id="visible-count">${rows.length} / ${rows.length}</span></div>
    <div class="table-scroll"><table class="compact-table case-table"><thead><tr><th>CASE</th><th>模型 / 模式</th><th>方向 / 决策</th><th>计划 E / S / T</th><th>实际 E / X</th><th>结果</th><th>NET R</th><th>MFE / MAE</th><th>成本 / 耗时</th></tr></thead><tbody>${rows
      .map((row, index) => {
        const answer = row.answer;
        const plan = answer.initialSubmission?.entry_plan;
        const result = answer.result;
        const outcome = result?.terminationReason ?? answer.status;
        const submittedAt = decisionBar(answer);
        const provSearch = row.provenance ? ` ${row.provenance.sourceSymbol}` : '';
        return `<tr class="case-row" data-model="${escapeHtml(answer.model)}" data-mode="${escapeHtml(answer.mode)}" data-outcome="${escapeHtml(outcome)}" data-search="${escapeHtml(`${answer.symbol} ${answer.questionId}${provSearch}`.toLowerCase())}"><td><a href="#case-${index}"><strong>${escapeHtml(answer.symbol)}${row.provenance ? ` <span class="provenance-alias">→ ${escapeHtml(row.provenance.sourceSymbol)}</span>` : ''}</strong><small>${escapeHtml(answer.questionId)}${row.provenance ? ` · ${escapeHtml(row.provenance.sourceCutoff.slice(0, 10))}` : ''}</small></a></td><td><strong>${escapeHtml(answer.model)}</strong><small>${escapeHtml(MODE_LABELS[answer.mode] ?? answer.mode)} · REP ${answer.rep}</small></td><td><strong>${escapeHtml(DIRECTION_LABELS[answer.initialSubmission?.direction ?? ''] ?? '—')}</strong><small>${submittedAt == null ? '未决策' : `B${submittedAt} 首次决策`}</small></td><td class="mono">${fmt(plan?.entry)} / <span class="negative">${fmt(plan?.stop)}</span> / <span class="positive">${fmt(plan?.target1)}</span></td><td class="mono"><span>${fmt(result?.entry?.price)} / ${fmt(result?.exit?.price)}</span><small>${closedTrades(answer).length} 笔完整交易</small></td><td><span class="status ${valueClass(result?.netR)}">${escapeHtml(TERMINATION_LABELS[outcome] ?? outcome)}</span></td><td class="mono ${valueClass(result?.netR)}">${fmtSigned(result?.netR, 3)}</td><td class="mono">${fmt(result?.mfeR)} / ${fmt(result?.maeR)}</td><td><span>${fmtUsd(answer.metrics.costUsd)}</span><small>${fmtDuration(answer.metrics.durationMs)}</small></td></tr>`;
      })
      .join('')}</tbody></table></div></section>`;
}

function fact(label: string, value: string, tone = ''): string {
  return `<div><dt>${escapeHtml(label)}</dt><dd class="${tone}">${escapeHtml(value)}</dd></div>`;
}

const PHASE_LABELS: Record<string, string> = {
  flat: '空仓',
  observing: '观察期',
  awaiting_submission: '等待决策',
  waiting_fill: '待成交',
  pending: '待成交',
  submitted: '已提交',
  active: '持仓中',
  open: '持仓中',
  position: '持仓中',
  terminal: '已终结',
  completed: '已完成',
};

function phaseLabel(phase: string | null): string {
  if (!phase) return '—';
  return PHASE_LABELS[phase] ?? phase;
}

function processChecks(
  row: ReportRow,
  available: ChartTimeframe[],
): Array<{ label: string; pass: boolean; detail: string }> {
  const events = row.processEvents;
  const submissionIndex = events.findIndex((event) => event.tool === 'submit_prediction');
  const beforeSubmission = submissionIndex >= 0 ? events.slice(0, submissionIndex) : events;
  const periods = new Set(
    beforeSubmission
      .filter(
        (event): event is ProcessEvent & { timeframe: ChartTimeframe } =>
          event.tool === 'fetch_kline' && event.timeframe != null,
      )
      .map((event) => event.timeframe),
  );
  const submitCount = events.filter((event) => event.tool === 'submit_prediction').length;
  const submissionsWhileFlat = events
    .filter((event) => event.tool === 'submit_prediction')
    .every((event) => event.phaseBefore === 'flat' || event.phaseBefore === 'observing');
  const dataReadOnly = events
    .filter((event) => event.kind === 'data')
    .every((event) => event.barBefore === event.barAfter);
  const replayStepSafe = events
    .filter((event) => event.kind === 'observe' || event.kind === 'manage')
    .every((event) => event.barAfter >= event.barBefore && event.barAfter - event.barBefore <= 1);
  const finalBar = row.question?.replay.horizonBars ?? 0;
  const fullHorizon =
    row.answer.status !== 'completed' ||
    (row.answer.result?.terminationReason !== 'horizon' &&
      row.answer.result?.terminationReason !== 'no_trade') ||
    events.some((event) => event.barAfter === finalBar && event.phaseAfter === 'terminal');
  const requiredWarnings = Array.from({ length: Math.min(5, finalBar) }, (_, index) => index + 1);
  const warningCounts = new Set(
    row.trace
      .filter((line) => line.type === 'prompt_context' && line.warningInjected === true)
      .map((line) => nonNegativeInteger(line.remainingBars))
      .filter((value): value is number => value != null),
  );
  const countdownComplete = requiredWarnings.every((remaining) => warningCounts.has(remaining));
  const errors = events.filter((event) => event.isError).length;
  return [
    {
      label: '周期覆盖',
      pass: available.length > 0 && available.every((tf) => periods.has(tf)),
      detail: `${available.filter((tf) => periods.has(tf)).length}/${available.length || 0}`,
    },
    {
      label: '重复交易边界',
      pass: submissionsWhileFlat,
      detail: `${submitCount} 次提交，均从空仓发起`,
    },
    {
      label: '完整时域',
      pass: dataReadOnly && replayStepSafe && fullHorizon,
      detail: `只读不推进；终局 B${finalBar}`,
    },
    {
      label: 'T-5 强平提醒',
      pass: countdownComplete,
      detail: countdownComplete
        ? 'T-5 至 T-1 完整'
        : `已记录 ${
            [...warningCounts]
              .sort((a, b) => b - a)
              .map((value) => `T-${value}`)
              .join(' / ') || '无'
          }`,
    },
    { label: '工具执行', pass: errors === 0, detail: errors === 0 ? '无错误' : `${errors} 个错误` },
  ];
}

function renderProcessChain(
  row: ReportRow,
  index: number,
  available: ChartTimeframe[],
  defaultTimeframe: ChartTimeframe,
): string {
  const events = row.processEvents;
  const chartId = `trade-chart-${index}`;
  const submittedAt = decisionBar(row.answer);
  const trades = closedTrades(row.answer);
  const entryAt = replayBarIndex(row.question, row.answer.result?.entry?.time);
  const exitAt = replayBarIndex(row.question, row.answer.result?.exit?.time);
  const timing = [
    submittedAt == null ? '未提交决策' : `决策 B${submittedAt}`,
    trades.length === 0 ? '全程空仓' : `${trades.length} 笔完整交易`,
    entryAt == null || exitAt == null ? '无成交区间' : `首次成交 B${entryAt} · 最后退出 B${exitAt}`,
  ];
  if (events.length === 0) {
    return `<section class="process-panel"><div class="process-head"><div><strong>可观察决策链</strong><span>${escapeHtml(timing.join(' · '))}</span></div></div><p class="process-empty">该结果未附加工具 trace；K 线仍显示可验证的 case 起点、决策与成交结果。</p></section>`;
  }
  const checks = processChecks(row, available);
  const passed = checks.filter((check) => check.pass).length;
  return `<section class="process-panel"><div class="process-head"><div><strong>可观察决策链</strong><span>${escapeHtml(timing.join(' · '))}</span></div><div><span class="process-score ${passed === checks.length ? 'pass' : 'fail'}">过程检查 ${passed}/${checks.length}</span><button type="button" class="process-reset" data-process-reset data-chart="${chartId}">查看终局</button></div></div>
    <div class="process-rail" role="list" aria-label="工具调用链">${events
      .map((event) => {
        const bar =
          event.barBefore === event.barAfter
            ? `B${event.snapshotBar}`
            : `B${event.barBefore} → B${event.barAfter}`;
        const transition =
          event.phaseBefore === event.phaseAfter
            ? phaseLabel(event.phaseAfter)
            : `${phaseLabel(event.phaseBefore)} → ${phaseLabel(event.phaseAfter)}`;
        const rawTimeframe = event.timeframe ?? defaultTimeframe;
        const timeframe = available.includes(rawTimeframe) ? rawTimeframe : defaultTimeframe;
        return `<button type="button" role="listitem" class="process-node ${event.kind}${event.isError ? ' error' : ''}" data-process-node data-chart="${chartId}" data-timeframe="${timeframe}" data-bar-index="${event.snapshotBar}" title="${escapeHtml(event.tool)}"><span class="process-index">${String(event.sequence).padStart(2, '0')}</span><span class="process-bar">${escapeHtml(bar)}</span><strong>${escapeHtml(event.label)}</strong><small>${escapeHtml(event.detail)}</small><em>${escapeHtml(transition)}${event.durationMs == null ? '' : ` · ${escapeHtml(fmtDuration(event.durationMs))}`}</em></button>`;
      })
      .join('')}</div>
    <div class="process-checks">${checks.map((check) => `<span class="${check.pass ? 'pass' : 'fail'}" title="${escapeHtml(check.detail)}"><i>${check.pass ? '✓' : '!'}</i>${escapeHtml(check.label)} <small>${escapeHtml(check.detail)}</small></span>`).join('')}</div></section>`;
}

function renderTradeLedger(row: ReportRow): string {
  const trades = closedTrades(row.answer);
  if (trades.length === 0) {
    return `<section class="trade-ledger"><h4>交易明细</h4><p>该 Episode 全程没有成交。</p></section>`;
  }
  return `<details class="trade-ledger" open><summary>交易明细 <span>${trades.length}</span></summary><ol>${trades
    .map((trade) => {
      const entryBar = replayBarIndex(row.question, trade.entry.time);
      const exitBar = replayBarIndex(row.question, trade.exit.time);
      const reason = tradeExitLabel(trade);
      const entryReason = tradeEntryReason(row, trade);
      return `<li><div><strong>T${trade.tradeId} · ${escapeHtml(DIRECTION_LABELS[trade.direction])}</strong><small>B${trade.decisionBar} 决策 · ${entryBar == null ? '—' : `B${entryBar}`} → ${exitBar == null ? '—' : `B${exitBar}`} · ${escapeHtml(reason)}</small>${entryReason ? `<small class="trade-reason"><b>${escapeHtml(REASON_LABELS[entryReason.category])}</b>${escapeHtml(entryReason.summary)}</small>` : ''}</div><div class="trade-prices"><span>E ${fmt(trade.entry.price)}</span><span>S ${fmt(trade.initialStop)}${trade.finalStop === trade.initialStop ? '' : ` → ${fmt(trade.finalStop)}`}</span><span>T ${fmt(trade.target)}</span><span>X ${fmt(trade.exit.price)}</span></div><strong class="${valueClass(trade.netR)}">${fmtSigned(trade.netR, 3)} R</strong></li>`;
    })
    .join('')}</ol></details>`;
}

function renderActionRecord(record: EpisodeActionRecord): string {
  const reason = actionReason(record);
  const label = ACTION_LABELS[record.action.type] ?? record.action.type;
  const reasonLabel = reason ? REASON_LABELS[reason.category] : '未记录理由';
  return `<li><span>${String(record.step).padStart(2, '0')}</span><div><strong>${escapeHtml(label)} · ${escapeHtml(reasonLabel)}</strong>${reason ? `<small>${escapeHtml(reason.summary)}</small>` : ''}<em>${escapeHtml(record.effectiveBarTime ?? record.at)}</em></div></li>`;
}

function renderCaseDetail(row: ReportRow, index: number): string {
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
  const available = availableTimeframesFor(row.question);
  const defaultTimeframe: ChartTimeframe = available[0] ?? 'day';
  return `<article class="trade-case" id="case-${index}" data-model="${escapeHtml(answer.model)}" data-mode="${escapeHtml(answer.mode)}" data-outcome="${escapeHtml(outcome)}">
    <header class="case-head"><div><h3>${escapeHtml(answer.symbol)}${row.provenance ? ` <span class="provenance-alias">→ ${escapeHtml(row.provenance.sourceSymbol)}</span>` : ''}</h3><span>${escapeHtml(answer.questionId)} · ${escapeHtml(answer.model)} · ${escapeHtml(MODE_LABELS[answer.mode] ?? answer.mode)}</span>${row.provenance ? `<small class="provenance-line">${escapeHtml(formatProvenanceLine(row.provenance))}</small>` : ''}</div><div class="case-result"><span class="status ${valueClass(result?.netR)}">${escapeHtml(TERMINATION_LABELS[outcome] ?? outcome)}</span><strong class="${valueClass(result?.netR)}">${escapeHtml(fmtSigned(result?.netR, 3))} R</strong></div></header>
    <div class="case-layout"><section class="chart-panel"><div class="chart-toolbar"><div><strong>K 线与成交量</strong><span>点击工具节点可回看该 B 编号当时可见的数据</span></div><div class="timeframe-tabs" role="tablist" aria-label="K 线周期">${available.map((tf, i) => `<button type="button"${i === 0 ? ' class="active"' : ''} data-timeframe-tab data-chart="trade-chart-${index}" data-timeframe="${tf}">${CHART_TIMEFRAME_LABEL[tf]}</button>`).join('')}</div></div><div class="tv-chart" id="trade-chart-${index}" data-chart-id="trade-chart-${index}"><span class="chart-loading">加载图表…</span></div><div class="chart-legend"><span><i class="entry"></i>计划入场</span><span><i class="target"></i>止盈</span><span><i class="stop"></i>止损</span><span><i class="decision"></i>决策位置</span><span class="chart-range" data-chart-range="trade-chart-${index}"></span></div>${renderProcessChain(row, index, available, defaultTimeframe)}</section>
      <aside class="trade-sidebar"><section><h4>首次计划</h4><dl class="facts">${fact('方向', DIRECTION_LABELS[answer.initialSubmission?.direction ?? ''] ?? '—')}${fact('首次决策', submittedAt == null ? '—' : `B${submittedAt}`)}${fact('自主观察', `${observationBars(answer)} bars`)}${fact('计划入场', fmt(plan?.entry), 'entry-text')}${fact('止损', fmt(plan?.stop), 'negative')}${fact('止盈', fmt(plan?.target1), 'positive')}${fact('计划盈亏比', `${fmt(row.plannedRr)} R`)}${fact('止损距离', fmtPercent(row.stopDistancePct))}</dl>${initialReason ? `<p class="decision-reason"><b>${escapeHtml(REASON_LABELS[initialReason.category])}</b>${escapeHtml(initialReason.summary)}</p>` : plan?.rationale ? `<p class="rationale">${escapeHtml(plan.rationale)}</p>` : ''}</section>
      <section><h4>Episode 结果</h4><dl class="facts">${fact('完整交易', `${trades.length} 笔`)}${fact('盈利 / 亏损', `${result?.winCount ?? trades.filter((trade) => trade.netR > 0).length} / ${result?.lossCount ?? trades.filter((trade) => trade.netR < 0).length}`)}${fact('Gross / Net R', `${fmtSigned(result?.grossR, 3)} / ${fmtSigned(result?.netR, 3)}`, valueClass(result?.netR))}${fact('最大回撤', `${fmt(result?.maxDrawdownR)} R`)}${fact('MFE / MAE', `${fmt(result?.mfeR)} / ${fmt(result?.maeR)}`)}${fact('首次成交 / 末次退出', `${entryAt == null ? '—' : `B${entryAt}`} / ${exitAt == null ? '—' : `B${exitAt}`}`)}${fact('累计持有', `${result?.holdingBars ?? 0} bars`)}${fact('方向命中', row.directionHit == null ? '—' : row.directionHit ? '是' : '否')}</dl></section>
      ${renderTradeLedger(row)}<details class="actions"><summary>回放动作与理由 <span>${actions.length}</span></summary>${actions.length === 0 ? `<p>没有动作记录</p>` : `<ol>${actions.map(renderActionRecord).join('')}</ol>`}</details></aside></div>
  </article>`;
}

function renderAudit(audits: EpisodeDataAudit[]): string {
  if (audits.length === 0)
    return `<details class="panel audit-panel"><summary><span>长桥数据审计</span><strong>未附加</strong></summary></details>`;
  const checks = audits.flatMap((audit) => audit.checks.map((check) => ({ audit, check })));
  const passed = checks.filter((entry) => entry.check.status === 'pass').length;
  return `<details class="panel audit-panel" ${passed === checks.length ? '' : 'open'}><summary><span>长桥数据审计 <small>逐字段校验 K 线、cutoff、时区与未来数据边界</small></span><strong class="${passed === checks.length ? 'positive' : 'negative'}">${passed}/${checks.length} 通过</strong></summary><div class="audit-grid">${checks.map(({ audit, check }) => `<div class="audit-check ${check.status}"><i>${check.status === 'pass' ? '✓' : '!'}</i><span><strong>${escapeHtml(check.label)}</strong><small>${escapeHtml(audit.questionId)} · ${escapeHtml(check.id)}</small>${check.detail ? `<em>${escapeHtml(check.detail)}</em>` : ''}</span></div>`).join('')}</div></details>`;
}

const STYLES = String.raw`
  :root{color-scheme:light;--bg:#f5f5f5;--panel:#fff;--line:#e5e5e5;--line-strong:#d4d4d4;--text:#171717;--muted:#737373;--green:#059669;--red:#dc2626;--blue:#2563eb;--soft:#fafafa;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text);font:13px/1.45 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}.report{width:min(1440px,calc(100% - 32px));margin:0 auto;border:1px solid var(--line)}.report-header,.panel,.trade-case{background:var(--panel);border:1px solid var(--line);border-left:0;border-right:0}.report>:first-child{border-top:0}.report>*+*{margin-top:10px}.report-header{display:flex;align-items:center;gap:18px;padding:14px 16px}.report-title{min-width:260px}.report-title h1{font-size:18px;margin:0}.report-title p{margin:2px 0 0;color:var(--muted);font:11px var(--mono)}.header-meta{display:flex;align-items:center;gap:6px;flex:1;flex-wrap:wrap}.chip,.status{display:inline-flex;align-items:center;min-height:24px;padding:3px 8px;border:1px solid var(--line);border-radius:4px;background:var(--soft);font-size:11px;white-space:nowrap}.audit-state{font-weight:650}.audit-state.pass{color:var(--green);border-color:#a7d8c7;background:#f0fdf8}.audit-state.fail{color:var(--red);border-color:#efb4b4;background:#fff5f5}.generated{margin-left:auto;color:var(--muted);font:10px var(--mono);white-space:nowrap}.summary{padding:0;overflow:hidden}.panel-title{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 12px;border-bottom:1px solid var(--line)}.panel-title h2{font-size:13px;margin:0}.panel-title span{color:var(--muted);font-size:11px}.metrics{display:grid;grid-template-columns:repeat(6,1fr);border-bottom:1px solid var(--line)}.metric{min-width:0;padding:10px 12px;border-right:1px solid var(--line)}.metric:nth-child(6n){border-right:0}.metric span,.metric small{display:block;color:var(--muted);font-size:10px}.metric strong{display:block;margin:3px 0 1px;font:600 18px var(--mono);letter-spacing:-.03em}.positive{color:var(--green)!important}.negative{color:var(--red)!important}.neutral{color:var(--text)}.config-strip{display:flex;gap:0;overflow:auto}.config-strip div{flex:1;min-width:112px;padding:8px 12px;border-right:1px solid var(--line)}.config-strip div:last-child{border:0}.config-strip span,.config-strip strong{display:block}.config-strip span{color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.04em}.config-strip strong{margin-top:2px;font:600 11px var(--mono)}.table-scroll{overflow:auto}.compact-table{width:100%;border-collapse:collapse;min-width:880px}.compact-table th{padding:7px 10px;background:var(--soft);border-bottom:1px solid var(--line);color:var(--muted);font-size:9px;text-align:left;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}.compact-table td{padding:8px 10px;border-bottom:1px solid #f5f5f5;vertical-align:middle;white-space:nowrap}.compact-table tbody tr:last-child td{border-bottom:0}.compact-table tbody tr:hover{background:#fafafa}.compact-table strong,.compact-table small{display:block}.compact-table small{color:var(--muted);font-size:9px}.mono{font-family:var(--mono)}a{color:inherit}.filters{display:flex;gap:6px;padding:8px 10px;border-bottom:1px solid var(--line)}.filters select,.filters input{height:30px;padding:0 9px;border:1px solid var(--line-strong);border-radius:4px;background:#fff;color:var(--text);font:11px inherit;outline:none}.filters select:focus,.filters input:focus{border-color:var(--blue);box-shadow:0 0 0 2px #dbeafe}.filters input{flex:1;min-width:180px}.filters>span{align-self:center;margin-left:auto;color:var(--muted);font:10px var(--mono)}.case-row[hidden],.trade-case[hidden]{display:none}.status.positive{background:#eefbf5;border-color:#b4e2d0}.status.negative{background:#fff3f3;border-color:#efb8b8}.trade-case{overflow:hidden;scroll-margin-top:10px}.case-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-bottom:1px solid var(--line)}.case-head h3{display:inline;margin:0 8px 0 0;font-size:15px}.case-head>div>span{color:var(--muted);font-size:10px}.case-result{display:flex;align-items:center;gap:10px}.case-result strong{font:650 17px var(--mono)}.case-layout{display:grid;grid-template-columns:minmax(0,1fr) 310px}.chart-panel{min-width:0;border-right:1px solid var(--line)}.chart-toolbar{height:48px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:7px 10px;border-bottom:1px solid var(--line)}.chart-toolbar strong,.chart-toolbar span{display:block}.chart-toolbar span{color:var(--muted);font-size:9px}.timeframe-tabs{display:flex;border:1px solid var(--line-strong);border-radius:4px;overflow:hidden}.timeframe-tabs button{height:28px;padding:0 12px;border:0;border-right:1px solid var(--line-strong);background:#fff;color:var(--muted);font:11px inherit;cursor:pointer}.timeframe-tabs button:last-child{border-right:0}.timeframe-tabs button.active{background:#e5e5e5;color:var(--text);font-weight:650}.tv-chart{height:360px;position:relative;background:#fff}.chart-marker-tooltip{position:absolute;pointer-events:none;background:#171717;color:#fff;padding:6px 8px;border-radius:4px;font:10px var(--mono);line-height:1.5;max-width:240px;z-index:30;box-shadow:0 6px 20px rgba(0,0,0,.18);display:none;white-space:normal}.chart-marker-tooltip div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.chart-loading,.chart-error{position:absolute;inset:0;display:grid;place-items:center;color:var(--muted);font-size:11px}.chart-error{color:var(--red)}.chart-legend{height:31px;display:flex;align-items:center;gap:14px;padding:0 10px;border-top:1px solid var(--line);color:var(--muted);font-size:9px}.chart-legend span{display:flex;align-items:center;gap:5px}.chart-legend i{display:block;width:14px;height:2px}.chart-legend i.entry{background:var(--blue)}.chart-legend i.target{background:var(--green)}.chart-legend i.stop{background:var(--red)}.chart-range{margin-left:auto!important;font-family:var(--mono)}.trade-sidebar{background:#fafafa}.trade-sidebar>section,.actions{padding:10px 12px;border-bottom:1px solid var(--line)}.trade-sidebar h4{margin:0 0 8px;font-size:11px}.facts{display:grid;grid-template-columns:1fr 1fr;gap:7px 12px;margin:0}.facts div{min-width:0}.facts dt{color:var(--muted);font-size:9px}.facts dd{margin:1px 0 0;font:600 11px var(--mono)}.entry-text{color:var(--blue)}.rationale{margin:8px 0 0;padding-top:8px;border-top:1px solid var(--line);color:var(--muted);font-size:10px}.actions{padding:0}.actions summary{display:flex;justify-content:space-between;padding:9px 12px;cursor:pointer;font-size:10px;font-weight:650}.actions summary span{color:var(--muted)}.actions p{margin:0;padding:0 12px 10px;color:var(--muted);font-size:10px}.actions ol{list-style:none;margin:0;padding:0 12px 8px}.actions li{display:grid;grid-template-columns:22px 58px 1fr;gap:6px;padding:5px 0;border-top:1px solid var(--line);font-size:9px}.actions li>span,.actions li small{color:var(--muted);font-family:var(--mono)}.audit-panel>summary{display:flex;align-items:center;justify-content:space-between;padding:11px 12px;cursor:pointer;font-size:12px;font-weight:650}.audit-panel>summary small{margin-left:8px;color:var(--muted);font-weight:400}.audit-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line);border-top:1px solid var(--line)}.audit-check{display:grid;grid-template-columns:20px 1fr;gap:7px;padding:8px;background:#fff}.audit-check i{display:grid;place-items:center;width:18px;height:18px;border-radius:50%;background:#e9f9f2;color:var(--green);font-style:normal;font-size:10px}.audit-check.fail i{background:#fff0f0;color:var(--red)}.audit-check strong,.audit-check small,.audit-check em{display:block}.audit-check strong{font-size:10px}.audit-check small{color:var(--muted);font:8px var(--mono)}.audit-check em{margin-top:3px;color:var(--muted);font-size:9px;font-style:normal}.footer{display:flex;justify-content:space-between;gap:16px;padding:6px 12px;color:var(--muted);font-size:9px}.footer a{color:var(--blue)}@media(max-width:1050px){.metrics{grid-template-columns:repeat(3,1fr)}.metric:nth-child(3n){border-right:0}.case-layout{grid-template-columns:1fr}.chart-panel{border-right:0;border-bottom:1px solid var(--line)}.trade-sidebar{display:grid;grid-template-columns:1fr 1fr}.actions{grid-column:1/-1}.audit-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:680px){.report{width:100%;margin:0}.report-header,.panel,.trade-case{border-left:0;border-right:0}.report-header{display:block}.header-meta{margin-top:8px}.generated{width:100%;margin:2px 0 0}.metrics{grid-template-columns:repeat(2,1fr)}.metric:nth-child(3n){border-right:1px solid var(--line)}.metric:nth-child(2n){border-right:0}.filters{flex-wrap:wrap}.filters select{flex:1}.filters input{order:2;flex-basis:100%}.case-head{align-items:flex-start}.case-head>div>span{display:block;margin-top:2px}.case-result{align-items:flex-end;flex-direction:column;gap:4px}.chart-toolbar{height:auto;align-items:flex-start;flex-direction:column}.timeframe-tabs{width:100%}.timeframe-tabs button{flex:1}.tv-chart{height:330px}.trade-sidebar{display:block}.audit-grid{grid-template-columns:1fr}.audit-panel>summary small{display:none}.footer{padding:8px 10px;display:block}}@media print{body{background:#fff}.report{width:100%;margin:0}.filters{display:none}.panel,.trade-case,.report-header{break-inside:avoid}.tv-chart{height:300px}}
`;

const PROCESS_STYLES = String.raw`
  .chart-legend i.decision{background:#7c3aed}.process-panel{border-top:1px solid var(--line);background:#fafafa}.process-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 10px;border-bottom:1px solid var(--line)}.process-head>div:first-child strong,.process-head>div:first-child span{display:block}.process-head>div:first-child strong{font-size:11px}.process-head>div:first-child span{margin-top:1px;color:var(--muted);font:9px var(--mono)}.process-head>div:last-child{display:flex;align-items:center;gap:6px}.process-score,.process-reset{height:25px;padding:0 8px;border:1px solid var(--line-strong);border-radius:4px;background:#fff;font:9px inherit}.process-score{display:inline-flex;align-items:center}.process-score.pass{color:var(--green);border-color:#a7d8c7;background:#f0fdf8}.process-score.fail{color:var(--red);border-color:#efb4b4;background:#fff5f5}.process-reset{cursor:pointer;color:var(--text)}.process-reset:hover{background:var(--soft)}.process-rail{display:flex;gap:14px;padding:10px;overflow-x:auto;scrollbar-width:thin}.process-node{position:relative;flex:0 0 154px;min-height:94px;padding:8px 9px;border:1px solid var(--line);border-top:3px solid #a3a3a3;border-radius:5px;background:#fff;color:var(--text);text-align:left;cursor:pointer}.process-node::after{content:"";position:absolute;top:42px;left:calc(100% + 1px);width:14px;height:1px;background:var(--line-strong)}.process-node:last-child::after{display:none}.process-node:hover{border-color:#a3a3a3;background:#fafafa}.process-node.active{border-color:#7c3aed;box-shadow:0 0 0 2px #ede9fe;background:#faf9ff}.process-node.data{border-top-color:#2563eb}.process-node.observe{border-top-color:#d97706}.process-node.decision{border-top-color:#7c3aed}.process-node.manage{border-top-color:#059669}.process-node.warning{border-top-color:#dc2626;background:#fffafa}.process-node.warning .process-bar{color:#dc2626}.process-node.error{border-color:var(--red);border-top-color:var(--red)}.process-index{position:absolute;top:6px;right:7px;color:#a3a3a3;font:8px var(--mono)}.process-bar{display:block;color:#7c3aed;font:650 10px var(--mono)}.process-node strong,.process-node small,.process-node em{display:block}.process-node strong{margin-top:5px;font-size:10px}.process-node small{margin-top:2px;color:var(--muted);font-size:8px;line-height:1.3}.process-node em{margin-top:6px;color:#a3a3a3;font:7px var(--mono);font-style:normal}.process-checks{display:flex;align-items:center;gap:14px;min-height:31px;padding:6px 10px;border-top:1px solid var(--line);background:#fff;overflow-x:auto}.process-checks>span{display:inline-flex;align-items:center;gap:4px;white-space:nowrap;font-size:8px;color:var(--muted)}.process-checks i{display:grid;place-items:center;width:14px;height:14px;border-radius:50%;font-style:normal}.process-checks .pass i{color:var(--green);background:#e9f9f2}.process-checks .fail i{color:var(--red);background:#fff0f0}.process-checks small{font:7px var(--mono);color:#a3a3a3}.process-empty{margin:0;padding:12px;color:var(--muted);font-size:10px}.trade-ledger{padding:0!important;border-bottom:1px solid var(--line)}.trade-ledger>h4,.trade-ledger>p{margin:0;padding:9px 12px}.trade-ledger>p{padding-top:0;color:var(--muted);font-size:9px}.trade-ledger>summary{display:flex;justify-content:space-between;padding:9px 12px;cursor:pointer;font-size:10px;font-weight:650}.trade-ledger>summary span{color:var(--muted)}.trade-ledger ol{list-style:none;margin:0;padding:0 12px 8px}.trade-ledger li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px 8px;padding:7px 0;border-top:1px solid var(--line)}.trade-ledger li>div:first-child strong,.trade-ledger li>div:first-child small{display:block}.trade-ledger li>div:first-child strong{font-size:9px}.trade-ledger li>div:first-child small{color:var(--muted);font:7px var(--mono)}.trade-prices{grid-column:1/-1;display:flex;gap:7px;color:var(--muted);font:7px var(--mono);white-space:nowrap}.trade-ledger li>strong{grid-column:2;grid-row:1;font:650 10px var(--mono)}@media(max-width:680px){.process-head{align-items:flex-start;flex-direction:column}.process-head>div:last-child{width:100%;justify-content:space-between}.process-node{flex-basis:146px}.process-checks{gap:10px}.process-checks small{display:none}}@media print{.process-reset{display:none}.process-rail{flex-wrap:wrap;overflow:visible}.process-node{flex-basis:140px}}
`;

const REASON_STYLES = String.raw`
  .reason-empty{margin:0;padding:12px;color:var(--muted);font-size:10px}.reason-table{min-width:720px}.decision-reason{margin:8px 0 0;padding-top:8px;border-top:1px solid var(--line);color:var(--muted);font-size:10px}.decision-reason b,.trade-reason b{display:inline-block;margin-right:6px;color:#7c3aed}.trade-ledger li>div:first-child .trade-reason{margin-top:4px;color:var(--text);font:9px/1.45 inherit}.actions li{grid-template-columns:22px minmax(0,1fr);gap:6px;padding:7px 0}.actions li>div strong,.actions li>div small,.actions li>div em{display:block}.actions li>div strong{font-size:9px}.actions li>div small{margin-top:2px;color:var(--text);font:9px/1.4 inherit}.actions li>div em{margin-top:3px;color:var(--muted);font:7px var(--mono);font-style:normal}
`;

const SCRIPT = String.raw`
  (() => {
    const payloads = new Map(REPORT_CHARTS.map((item) => [item.id, item]));
    const instances = new Map();
    const viewState = new Map();
    const library = window.LightweightCharts;

    function createHistoricalBackground(chart, splitTime) {
      if (splitTime == null) return null;
      const renderer = {
        draw(target) {
          target.useBitmapCoordinateSpace((scope) => {
            const x = chart.timeScale().timeToCoordinate(splitTime);
            if (x == null) return;
            const ctx = scope.context;
            const dpr = scope.horizontalPixelRatio;
            const cutX = Math.round((x + 0.5) * dpr);
            const h = scope.bitmapSize.height;
            ctx.save();
            ctx.fillStyle = 'rgba(148,163,184,0.14)';
            ctx.fillRect(0, 0, cutX, h);
            ctx.strokeStyle = 'rgba(124,58,237,0.55)';
            ctx.lineWidth = Math.max(1, dpr);
            ctx.setLineDash([Math.max(4, dpr * 3), Math.max(3, dpr * 2)]);
            ctx.beginPath();
            ctx.moveTo(cutX, 0);
            ctx.lineTo(cutX, h);
            ctx.stroke();
            ctx.restore();
          });
        },
      };
      const paneView = {
        renderer: () => renderer,
        zOrder: () => 'bottom',
        update: () => {},
      };
      return {
        updateAllViews() {},
        paneViews() { return [paneView]; },
        attached() {},
        detached() {},
      };
    }

    function mergeBars(base, updates) {
      const merged = new Map(base.map((bar) => [String(bar.time), bar]));
      updates.forEach((bar) => merged.set(String(bar.time), bar));
      return [...merged.values()].sort((left, right) => {
        if (typeof left.time === 'number' && typeof right.time === 'number') return left.time - right.time;
        return String(left.time).localeCompare(String(right.time));
      });
    }

    function rangesForBar(payload, barIndex) {
      let day = [...payload.baseRanges.day];
      let week = [...payload.baseRanges.week];
      for (let index = 1; index <= barIndex; index += 1) {
        const patch = payload.snapshotPatches[String(index)];
        if (!patch) continue;
        day = mergeBars(day, patch.day || []);
        week = mergeBars(week, patch.week || []);
      }
      return {
        h1: [...payload.baseRanges.h1, ...payload.replayH1.slice(0, barIndex)],
        day,
        week,
      };
    }

    function renderChart(id, timeframe, requestedBarIndex) {
      const container = document.getElementById(id);
      const payload = payloads.get(id);
      if (!container || !payload) return;
      const prior = viewState.get(id);
      const parsedBarIndex = Number(requestedBarIndex);
      const barIndex = Number.isFinite(parsedBarIndex)
        ? Math.max(0, Math.min(payload.finalBarIndex, Math.floor(parsedBarIndex)))
        : prior?.barIndex ?? payload.finalBarIndex;
      const ranges = rangesForBar(payload, barIndex);
      const previous = instances.get(id);
      if (previous) previous.remove();
      container.innerHTML = '';
      if (!library) {
        container.innerHTML = '<span class="chart-error">TradingView Lightweight Charts 加载失败</span>';
        return;
      }
      const data = ranges[timeframe] || [];
      const chart = library.createChart(container, {
        autoSize: true,
        layout: {
          background: { type: 'solid', color: '#ffffff' },
          textColor: '#737373',
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
          fontSize: 10,
          panes: { separatorColor: '#e5e5e5', separatorHoverColor: '#d4d4d4', enableResize: false },
        },
        grid: { vertLines: { color: '#f5f5f5' }, horzLines: { color: '#f5f5f5' } },
        rightPriceScale: { borderColor: '#e5e5e5', scaleMargins: { top: 0.08, bottom: 0.08 } },
        timeScale: { borderColor: '#e5e5e5', timeVisible: timeframe === 'h1', secondsVisible: false },
        crosshair: { mode: library.CrosshairMode.MagnetOHLC },
        handleScale: true,
        handleScroll: true,
      });
      const candles = chart.addSeries(library.CandlestickSeries, {
        upColor: '#0e9f6e', downColor: '#e02424', borderVisible: false,
        wickUpColor: '#0e9f6e', wickDownColor: '#e02424', priceLineVisible: false,
      });
      candles.setData(data.map((bar) => ({ time: bar.time, open: bar.open, high: bar.high, low: bar.low, close: bar.close })));
      const historicBars = payload.baseRanges[timeframe] || [];
      const splitTime = historicBars.length ? historicBars[historicBars.length - 1].time : null;
      const bg = createHistoricalBackground(chart, splitTime);
      if (bg && typeof candles.attachPrimitive === 'function') candles.attachPrimitive(bg);
      const volume = chart.addSeries(library.HistogramSeries, {
        priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false,
      }, 1);
      volume.setData(data.map((bar) => ({ time: bar.time, value: bar.volume, color: bar.close >= bar.open ? 'rgba(14,159,110,.45)' : 'rgba(224,36,36,.42)' })));
      payload.levels.forEach((level) => candles.createPriceLine({
        price: level.price, color: level.color, lineWidth: 1, lineStyle: library.LineStyle.Dashed,
        axisLabelVisible: true, title: level.title,
      }));
      const availableTimes = new Set(data.map((bar) => String(bar.time)));
      const markers = (payload.markers[timeframe] || []).filter((marker) => availableTimes.has(String(marker.time)));
      const tooltipMap = new Map();
      for (const m of markers) {
        const key = String(m.time);
        const arr = tooltipMap.get(key) || [];
        if (m.text) arr.push(m.text);
        tooltipMap.set(key, arr);
      }
      const silentMarkers = markers.map((m) => ({ time: m.time, position: m.position, color: m.color, shape: m.shape, text: '' }));
      if (silentMarkers.length) library.createSeriesMarkers(candles, silentMarkers, { autoScale: true });
      const tip = document.createElement('div');
      tip.className = 'chart-marker-tooltip';
      container.appendChild(tip);
      chart.subscribeCrosshairMove((param) => {
        if (!param || !param.time || !param.point) { tip.style.display = 'none'; return; }
        const texts = tooltipMap.get(String(param.time));
        if (!texts || !texts.length) { tip.style.display = 'none'; return; }
        tip.textContent = '';
        for (const line of texts) {
          const row = document.createElement('div');
          row.textContent = line;
          tip.appendChild(row);
        }
        tip.style.display = 'block';
        const rect = container.getBoundingClientRect();
        const tw = tip.offsetWidth;
        const th = tip.offsetHeight;
        const px = param.point.x + 14;
        const py = param.point.y + 14;
        tip.style.left = Math.max(4, Math.min(px, rect.width - tw - 6)) + 'px';
        tip.style.top = Math.max(4, Math.min(py, rect.height - th - 6)) + 'px';
      });
      const visibleBars = timeframe === 'h1' ? 90 : timeframe === 'day' ? 120 : 104;
      chart.timeScale().setVisibleLogicalRange({ from: Math.max(-0.5, data.length - visibleBars - 0.5), to: data.length + 6 });
      const panes = chart.panes();
      if (panes[1]) panes[1].setHeight(72);
      instances.set(id, chart);
      viewState.set(id, { timeframe, barIndex });
      container.dataset.activeBar = String(barIndex);
      const range = document.querySelector('[data-chart-range="' + id + '"]');
      if (range) {
        const scope = barIndex === payload.finalBarIndex ? '终局' : '历史快照';
        range.textContent = (timeframe === 'h1' ? '1 小时' : timeframe === 'day' ? '日线' : '周线') + ' · ' + data.length + ' bars · ' + scope + ' B' + barIndex;
      }
      document.querySelectorAll('[data-timeframe-tab][data-chart="' + id + '"]').forEach((button) => button.classList.toggle('active', button.dataset.timeframe === timeframe));
    }

    document.querySelectorAll('[data-timeframe-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        const state = viewState.get(button.dataset.chart);
        renderChart(button.dataset.chart, button.dataset.timeframe, state?.barIndex);
      });
    });
    document.querySelectorAll('[data-process-node]').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('[data-process-node][data-chart="' + button.dataset.chart + '"]').forEach((node) => node.classList.remove('active'));
        button.classList.add('active');
        const cp = payloads.get(button.dataset.chart);
        renderChart(button.dataset.chart, button.dataset.timeframe || cp?.defaultTimeframe || 'day', button.dataset.barIndex);
      });
    });
    document.querySelectorAll('[data-process-reset]').forEach((button) => {
      button.addEventListener('click', () => {
        const payload = payloads.get(button.dataset.chart);
        const state = viewState.get(button.dataset.chart);
        document.querySelectorAll('[data-process-node][data-chart="' + button.dataset.chart + '"]').forEach((node) => node.classList.remove('active'));
        if (payload) renderChart(button.dataset.chart, state?.timeframe || payload.defaultTimeframe || 'day', payload.finalBarIndex);
      });
    });
    const initialize = (element) => {
      const id = element.dataset.chartId;
      if (id && !instances.has(id)) {
        const cp = payloads.get(id);
        renderChart(id, cp?.defaultTimeframe || 'day', cp?.finalBarIndex);
      }
    };
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) { initialize(entry.target); observer.unobserve(entry.target); }
      }), { rootMargin: '300px' });
      document.querySelectorAll('.tv-chart').forEach((element) => observer.observe(element));
    } else document.querySelectorAll('.tv-chart').forEach(initialize);

    const model = document.querySelector('#model-filter');
    const mode = document.querySelector('#mode-filter');
    const outcome = document.querySelector('#outcome-filter');
    const search = document.querySelector('#case-search');
    const rows = [...document.querySelectorAll('.case-row')];
    const details = [...document.querySelectorAll('.trade-case')];
    const count = document.querySelector('#visible-count');
    const apply = () => {
      const query = (search?.value || '').trim().toLowerCase();
      let visible = 0;
      rows.forEach((row, index) => {
        const show = (!model?.value || row.dataset.model === model.value)
          && (!mode?.value || row.dataset.mode === mode.value)
          && (!outcome?.value || row.dataset.outcome === outcome.value)
          && (!query || (row.dataset.search || '').includes(query));
        row.hidden = !show;
        if (details[index]) details[index].hidden = !show;
        if (show) visible += 1;
      });
      if (count) count.textContent = visible + ' / ' + rows.length;
    };
    [model, mode, outcome].forEach((element) => element?.addEventListener('change', apply));
    search?.addEventListener('input', apply);
  })();
`;

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
  const firstQuestion = rows[0]?.question;
  const config = firstQuestion
    ? {
        h1: firstQuestion.fixtures.kline['1h']?.length ?? 0,
        day: firstQuestion.fixtures.kline.day?.length ?? 0,
        week: firstQuestion.fixtures.kline.week?.length ?? 0,
        sessions: firstQuestion.replay.horizonSessions ?? null,
        bars: firstQuestion.replay.horizonBars,
        decisionExpiry: firstQuestion.replay.decisionExpiryBars ?? null,
        expiry: firstQuestion.replay.entryExpiryBars ?? null,
        dayRollups: firstQuestion.replay.rollups?.day.length ?? 0,
        weekRollups: firstQuestion.replay.rollups?.week.length ?? 0,
      }
    : null;
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
  const charts = rows
    .map(buildChartPayload)
    .filter((payload): payload is ChartPayload => payload != null);
  const models = input.config.config?.models ?? [
    ...new Set(input.answers.map((answer) => answer.model)),
  ];
  const modes = input.config.config?.modes ?? [
    ...new Set(input.answers.map((answer) => answer.mode)),
  ];
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="color-scheme" content="light"/><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%232563eb'/%3E%3Cpath d='M8 7h4v7l7-7h5l-8 8 9 10h-5l-8-9v9H8z' fill='white'/%3E%3C/svg%3E"/><title>${escapeHtml(runId)} · Episode Bench Report</title><style>${STYLES}${PROCESS_STYLES}${REASON_STYLES}</style></head><body><main class="report">
    <header class="report-header"><div class="report-title"><h1>Episode Bench Report</h1><p>${escapeHtml(runId)}</p></div><div class="header-meta"><span class="chip">${(() => {
  const id = input.config.datasetVersion ?? input.config.config?.datasetVersion ?? '—';
  const meta = input.datasetMeta;
  const bits: string[] = [escapeHtml(id)];
  if (meta?.label) bits.push(escapeHtml(meta.label));
  if (meta?.kind) bits.push(escapeHtml(PLAYSTYLE_LABEL[meta.kind] ?? meta.kind));
  return bits.join(' · ');
})()}</span><span class="chip">${escapeHtml(models.join(' · '))}</span><span class="chip">${escapeHtml(modes.map((mode) => MODE_LABELS[mode] ?? mode).join(' / '))}</span><span class="chip">${input.config.costBps ?? 0} bps</span><span class="chip audit-state ${auditPassed === true ? 'pass' : auditPassed === false ? 'fail' : ''}">${auditPassed === true ? '长桥数据已校验' : auditPassed === false ? '数据审计失败' : '未附加数据审计'}</span><span class="generated">${escapeHtml(generatedAt)}</span></div></header>
    <section class="panel summary"><div class="panel-title"><h2>运行总览</h2><span>${metrics.completed}/${metrics.cases} 完成 · ${metrics.trades} 笔完整交易</span></div><div class="metrics">
      ${metricCell('平均净 R / case', `${fmtSigned(metrics.avgNetRPerCase, 3)} R`, `累计 ${fmtSigned(metrics.totalNetR, 3)} R`, valueClass(metrics.avgNetRPerCase))}
      ${metricCell('Episode 胜率', fmtPercent(metrics.winRate), `${metrics.wins} / ${metrics.completed} cases`, 'positive')}
      ${metricCell('交易胜率', fmtPercent(metrics.tradeWinRate), `${metrics.tradeWins} / ${metrics.trades} 笔`, 'positive')}
      ${metricCell('方向命中', fmtPercent(metrics.directionAccuracy), 'cutoff → horizon')}
      ${metricCell('Profit Factor', metrics.profitFactor === 'infinite' ? '∞' : fmt(metrics.profitFactor), '盈利 R / 亏损 R')}
      ${metricCell('参与 / 成交', `${fmtPercent(metrics.participationRate)} / ${fmtPercent(metrics.fillRate)}`, `${metrics.directional} 个方向订单`)}
      ${metricCell('单笔期望', `${fmtSigned(metrics.expectancy, 3)} R`, '已成交交易', valueClass(metrics.expectancy))}
      ${metricCell('MFE / MAE', `${fmt(metrics.avgMfeR)} / ${fmt(metrics.avgMaeR)}`, `捕获 ${fmtPercent(metrics.avgCaptureRate)}`)}
      ${metricCell('持有 / 回撤', `${fmt(metrics.avgHoldingBars, 1)} / ${fmt(metrics.avgMaxDrawdownR)} R`, 'bars / max DD')}
      ${metricCell('完成率', fmtPercent(metrics.completionRate), `${metrics.completed} / ${metrics.cases}`)}
      ${metricCell('执行成本', fmtUsd(metrics.avgCostUsd), `${input.config.costBps ?? 0} bps`)}
      ${metricCell('耗时 / 首次决策', `${fmtDuration(metrics.avgDurationMs)} / ${metrics.avgDecisionBars == null ? '—' : `B${fmt(metrics.avgDecisionBars, 1)}`}`, `${fmt(metrics.avgToolCalls, 1)} tools · ${fmt(metrics.avgTokens, 0)} tokens`)}
    </div><div class="config-strip"><div><span>初始 1H</span><strong>${config?.h1 ?? '—'} bars</strong></div><div><span>初始日线</span><strong>${config?.day ?? '—'} bars</strong></div><div><span>初始周线</span><strong>${config?.week ?? '—'} bars</strong></div><div><span>回放窗口</span><strong>${config?.sessions ?? '—'} sessions</strong></div><div><span>回放 1H</span><strong>${config?.bars ?? '—'} bars</strong></div><div><span>首次决策</span><strong>B0 起自主决定</strong></div><div><span>待成交窗口</span><strong>${config?.expiry ?? '—'} bars</strong></div><div><span>强平提醒</span><strong>T-5 → T-1</strong></div><div><span>长桥日 / 周回填</span><strong>${config?.dayRollups ?? '—'} / ${config?.weekRollups ?? '—'}</strong></div></div></section>
    ${renderReasonTable(rows)}${renderModelTable(rows)}${renderCasesTable(rows)}<section class="case-details">${rows.map(renderCaseDetail).join('')}</section>${renderAudit(audits)}
    <footer class="footer"><span>KANSOKU BENCH · Git ${escapeHtml(input.config.gitSha ?? '—')}</span><span>图表由 <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">TradingView Lightweight Charts™</a> 提供 · 行情数据源：长桥</span></footer>
  </main><script src="https://unpkg.com/lightweight-charts@5.2.0/dist/lightweight-charts.standalone.production.js"></script><script>const REPORT_CHARTS=${serializeForScript(charts)};${SCRIPT}</script></body></html>`;
  return { html, summary };
}
