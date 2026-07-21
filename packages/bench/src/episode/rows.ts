import type {
  EpisodeActionRecord,
  EpisodeAnswer,
  EpisodeClosedTrade,
} from '../schema/episode.js';
import type { Question } from '../schema/question.js';
import type { EpisodeTradeReason } from '../schema/tradeReason.js';
import { buildProcessEvents, type ProcessEvent } from './process.js';
import type { EpisodeProvenanceEntry, EpisodeReportTraceLine } from './report.js';

export interface ReportRow {
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

export function formatProvenanceLine(prov: EpisodeProvenanceEntry): string {
  const parts = [`Source: ${prov.sourceSymbol} @ ${prov.sourceCutoff.slice(0, 10)}`];
  if (prov.dayShift != null) parts.push(`shift +${prov.dayShift}d`);
  if (prov.priceScale != null && Number.isFinite(prov.priceScale)) {
    parts.push(`price ×${prov.priceScale.toFixed(2)}`);
  }
  return parts.join(' · ');
}

function finite(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

export function decisionBar(answer: EpisodeAnswer): number | null {
  if (answer.result?.decisionBar !== undefined) return answer.result.decisionBar ?? null;
  return answer.initialSubmission ? 0 : null;
}

export function observationBars(answer: EpisodeAnswer): number {
  return (
    answer.result?.observationBars ??
    answer.result?.actions.filter((action) => action.action.type === 'observe').length ??
    0
  );
}

export function closedTrades(answer: EpisodeAnswer): EpisodeClosedTrade[] {
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

export function tradeExitLabel(trade: EpisodeClosedTrade): string {
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

export function replayBarIndex(question: Question | undefined, time: string | undefined): number | null {
  if (!question || !time) return null;
  const index = question.replay.bars.findIndex((bar) => bar.time === time);
  return index >= 0 ? index + 1 : null;
}

export function actionReason(record: EpisodeActionRecord): EpisodeTradeReason | null {
  return 'reason' in record.action ? (record.action.reason ?? null) : null;
}

export function isDecisionAction(record: EpisodeActionRecord): boolean {
  return record.action.type !== 'observe';
}

export function tradeEntryReason(
  row: ReportRow,
  trade: EpisodeClosedTrade,
): EpisodeTradeReason | null {
  if (trade.entryReason) return trade.entryReason;
  const submitted = row.answer.result?.actions.find(
    (record) => record.tradeId === trade.tradeId && record.action.type === 'submit',
  );
  return submitted ? actionReason(submitted) : null;
}

export function buildRows(
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
