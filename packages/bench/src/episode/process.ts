import type { EpisodeTradeReason } from '../schema/tradeReason.js';
import { DIRECTION_LABELS, EVENT_LABELS, REASON_LABELS } from './labels.js';
import type { EpisodeReportTraceLine } from './report.js';

export type ChartTimeframe = 'h1' | 'day' | 'week';

export type ProcessKind = 'data' | 'observe' | 'decision' | 'manage' | 'warning' | 'other';

export interface ProcessEvent {
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

export function finite(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function nonNegativeInteger(value: unknown): number | null {
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

export function traceTimeframe(value: unknown): ChartTimeframe | null {
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

export function buildProcessEvents(trace: EpisodeReportTraceLine[]): ProcessEvent[] {
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

export function processChecks(
  events: ProcessEvent[],
  trace: EpisodeReportTraceLine[],
  finalBar: number,
  isEpisodeComplete: boolean,
  available: ChartTimeframe[],
): Array<{ label: string; pass: boolean; detail: string }> {
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
  const fullHorizon =
    !isEpisodeComplete ||
    events.some((event) => event.barAfter === finalBar && event.phaseAfter === 'terminal');
  const requiredWarnings = Array.from({ length: Math.min(5, finalBar) }, (_, index) => index + 1);
  const warningCounts = new Set(
    trace
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
