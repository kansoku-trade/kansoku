import type { RawBar } from '@kansoku/shared/types';
import type { EpisodeActionRecord } from '../schema/episode.js';
import type { Question } from '../schema/question.js';

// Findings are review candidates, not violations. A reason legitimately names prices the tape has
// never printed — targets, stops, invalidation levels, resting order prices — and legitimately
// looks ahead to bars it has not seen. Free text cannot be separated into retrospective claims and
// forward plans by pattern matching, so treat a finding as "worth a human read", and read the
// unaudited counts as the honest measure: how much of a reason is checkable at all.
export interface ReasonFinding {
  step: number;
  kind: 'future_bar' | 'impossible_price';
  cited: number;
  visible: string;
  summary: string;
}

export interface ReasonAudit {
  reasons: number;
  reasonsWithCitation: number;
  priceCitations: number;
  barCitations: number;
  findings: ReasonFinding[];
}

// A cited bar index may legitimately be off by one: the runtime status line numbers bars from 1
// while the prompt talks about B0, and models mix the two. Only a reference beyond that slack can
// be a claim about a bar the model has not been shown.
const BAR_INDEX_SLACK = 2;

// Prices are only checkable when they are recognisably prices. A bare integer is far more often a
// period length, a bar count or a percentage, so decimals are required, and the value must sit in
// the same order of magnitude as the tape. Anything outside that is left unaudited rather than
// guessed at.
const PRICE_BAND_LOW = 0.3;
const PRICE_BAND_HIGH = 3;

// Models quote prices rounded to one or two decimals, so an exact range test reports the tape's
// own extremes as impossible: 146.23 for a 146.232051 high, 94.3 for a 94.32 low. The tolerance
// covers one-decimal rounding and nothing wider.
const ROUNDING_TOLERANCE = 0.05;

const NUMBER_WITH_UNIT = /(\d+(?:\.\d+)?)\s*(r\b|%|％|根|倍|日|周|月|天|次|笔|bars?\b|k\b|m\b)/gi;
const DATE_LIKE = /\d{4}(?:-\d{2}){1,2}|\d{1,2}[/月-]\d{1,2}/g;
const DECIMAL = /\d+\.\d+/g;
const BAR_REF = /\bb(\d{1,3})\b/gi;

function numberOf(value: string | number): number {
  return typeof value === 'number' ? value : Number(value);
}

function visibleBars(question: Question, at: string): { bars: RawBar[]; cursor: number } {
  const replay = question.replay.bars;
  const cursor = replay.findIndex((bar) => bar.time === at);
  const pre = question.fixtures.kline['1h'] ?? [];
  if (cursor < 0) return { bars: [...pre], cursor: -1 };
  return { bars: [...pre, ...replay.slice(0, cursor + 1)], cursor };
}

function priceCandidates(summary: string, reference: number): number[] {
  const masked = summary.replaceAll(DATE_LIKE, ' ').replaceAll(NUMBER_WITH_UNIT, ' ');
  const out: number[] = [];
  for (const token of masked.match(DECIMAL) ?? []) {
    const value = Number(token);
    if (!Number.isFinite(value)) continue;
    if (value < reference * PRICE_BAND_LOW || value > reference * PRICE_BAND_HIGH) continue;
    out.push(value);
  }
  return out;
}

function barCandidates(summary: string): number[] {
  const out: number[] = [];
  for (const match of summary.matchAll(BAR_REF)) {
    const value = Number(match[1]);
    if (Number.isFinite(value)) out.push(value);
  }
  return out;
}

export function auditEpisodeReasons(
  question: Question,
  actions: readonly EpisodeActionRecord[],
): ReasonAudit {
  const audit: ReasonAudit = {
    reasons: 0,
    reasonsWithCitation: 0,
    priceCitations: 0,
    barCitations: 0,
    findings: [],
  };

  for (const record of actions) {
    const action = record.action as { reason?: { summary?: string } };
    const summary = action.reason?.summary;
    if (!summary) continue;
    audit.reasons += 1;

    const { bars, cursor } = visibleBars(question, record.at);
    if (bars.length === 0) continue;
    const lows = bars.map((bar) => numberOf(bar.low));
    const highs = bars.map((bar) => numberOf(bar.high));
    const low = Math.min(...lows);
    const high = Math.max(...highs);
    const reference = numberOf(bars.at(-1)!.close);

    const prices = priceCandidates(summary, reference);
    const barRefs = barCandidates(summary);
    audit.priceCitations += prices.length;
    audit.barCitations += barRefs.length;
    if (prices.length > 0 || barRefs.length > 0) audit.reasonsWithCitation += 1;

    for (const price of prices) {
      if (price >= low - ROUNDING_TOLERANCE && price <= high + ROUNDING_TOLERANCE) continue;
      audit.findings.push({
        step: record.step,
        kind: 'impossible_price',
        cited: price,
        visible: `${low.toFixed(2)}–${high.toFixed(2)}`,
        summary,
      });
    }
    for (const barRef of barRefs) {
      if (barRef <= cursor + 1 + BAR_INDEX_SLACK) continue;
      audit.findings.push({
        step: record.step,
        kind: 'future_bar',
        cited: barRef,
        visible: `B0–B${cursor + 1}`,
        summary,
      });
    }
  }

  return audit;
}
