import type { RawBar } from '@kansoku/shared/types';
import { preMarketRange, regularRange } from '../../analysis/dayLevels.js';
import { toTs } from '../../analysis/indicators.js';
import type { ReassessPack } from './datapack.js';

/**
 * Directional claims the user makes about the tape ("是不是突破了", "见底了吧", "主力在砸盘").
 *
 * Recall beats precision here: a false positive costs one buffered turn (the answer appears all at
 * once instead of streaming). A false negative ships an unverified conclusion to the screen, where
 * a later check cannot take it back. Err toward flagging.
 */
const CLAIM_PATTERNS = [
  /突破/,
  /冲高/,
  /回调/,
  /见底|探底|筑底|触底/,
  /见顶|做顶/,
  /企稳|站稳|站上/,
  /砸盘|打压|洗盘/,
  /崩|暴跌|大跌|完蛋|凉了/,
  /反转|翻多|翻空/,
  /跌破|破位/,
  /拉升|飙|冲破/,
  /止跌|反弹了|涨回来/,
  /要涨|要跌|会涨|会跌/,
  /\bbreak[\s-]?(out|down)\b/i,
  /\bbottom(ed|ing)?\b|\btop(ped|ping)\b/i,
  /\brevers(al|ed|ing)\b/i,
  /\bcapitulat/i,
];

export function isDirectionalClaim(text: string): boolean {
  return CLAIM_PATTERNS.some((re) => re.test(text));
}

export type ClaimStatus = 'supported' | 'partial' | 'contradicted' | 'insufficient';

export interface DirectionalVerification {
  verification_id: string;
  as_of: string;
  data_complete: boolean;
  last: number | null;
  last_bar_time: string | null;
  cash_high_today: number | null;
  cash_low_today: number | null;
  pre_market_high: number | null;
  prev_day_high: number | null;
  prev_day_close: number | null;
  /** Mechanical, computed here so the model cannot get the arithmetic wrong or skip it. */
  checks: {
    /** A cash-session pop that never cleared the pre-market high is NOT a breakout. */
    above_pre_market_high: boolean | null;
    above_prev_day_high: boolean | null;
    /** True only when the price is actually holding the level, not just printing it intraday. */
    cash_high_cleared_pre_market_high: boolean | null;
    pct_from_cash_high: number | null;
    pct_from_prev_close: number | null;
  };
  /** What the mechanical facts alone can say about an "it broke out" style claim. */
  breakout_verdict: ClaimStatus;
  notes: string[];
}

function lastBar(bars: RawBar[]): RawBar | null {
  return bars.at(-1) ?? null;
}

function pct(from: number, to: number): number {
  return Number((((to - from) / from) * 100).toFixed(2));
}

export function verifyDirectionalRead(
  pack: ReassessPack,
  verificationId: string,
  now: Date,
): DirectionalVerification {
  const m5 = pack.timeframes.m5?.bars ?? [];

  const tail = lastBar(m5);
  const last = tail ? Number(tail.close) : null;
  const lastBarTime = tail ? new Date(toTs(tail.time) * 1000).toISOString() : null;

  const cash = regularRange(m5, now);
  const pre = pack.day_levels?.pre_market ?? preMarketRange(m5, now);
  const prev = pack.day_levels?.prev_day ?? null;

  const notes: string[] = [];
  if (!tail) notes.push('No five-minute bar is available, so current price cannot be verified.');
  if (!pre) notes.push('Today\'s premarket range is unavailable, so a true breakout cannot be determined (TD-VERIFY-01 requires comparison with the premarket high).');
  if (!prev) notes.push('Prior-day high/close is unavailable, so the prior high cannot be compared.');
  if (!cash) notes.push('No regular-session bar is available today (premarket, after-hours, or market closed).');

  const dataComplete = Boolean(tail && pre && prev);

  const abovePre = last !== null && pre ? last > pre.high : null;
  const abovePrevHigh = last !== null && prev ? last > prev.high : null;
  const cashCleared = cash && pre ? cash.high > pre.high : null;

  let breakoutVerdict: ClaimStatus;
  if (!dataComplete) {
    breakoutVerdict = 'insufficient';
  } else if (abovePre && abovePrevHigh) {
    breakoutVerdict = 'supported';
  } else if (abovePre || abovePrevHigh || cashCleared) {
    breakoutVerdict = 'partial';
    if (cashCleared && !abovePre) {
      notes.push('Price briefly exceeded the premarket high intraday but failed to hold it: this is a false-breakout pattern, not a breakout.');
    }
    if (!cashCleared && abovePrevHigh) {
      notes.push('Price exceeded the prior-day high but not today\'s premarket high, so the claim is only partially supported.');
    }
  } else {
    breakoutVerdict = 'contradicted';
    if (cash && pre && cash.high <= pre.high) {
      notes.push('Today\'s regular-session high never reached the premarket high, so calling this move a breakout contradicts the data.');
    }
  }

  return {
    verification_id: verificationId,
    as_of: pack.as_of,
    data_complete: dataComplete,
    last,
    last_bar_time: lastBarTime,
    cash_high_today: cash?.high ?? null,
    cash_low_today: cash?.low ?? null,
    pre_market_high: pre?.high ?? null,
    prev_day_high: prev?.high ?? null,
    prev_day_close: prev?.close ?? null,
    checks: {
      above_pre_market_high: abovePre,
      above_prev_day_high: abovePrevHigh,
      cash_high_cleared_pre_market_high: cashCleared,
      pct_from_cash_high: last !== null && cash ? pct(cash.high, last) : null,
      pct_from_prev_close: last !== null && prev ? pct(prev.close, last) : null,
    },
    breakout_verdict: breakoutVerdict,
    notes,
  };
}

/**
 * The gate. A model that claims `supported` while the mechanical breakout check says
 * `contradicted` is overruled — this is the code-level half of TD-VERIFY-01, and the reason the
 * anti-sycophancy rule is more than prose.
 */
export function rejectAnswer(
  submitted: { claim_status: ClaimStatus; verification_id?: string },
  minted: Map<string, DirectionalVerification>,
): string | null {
  if (!submitted.verification_id) {
    return 'rejected: the user made a directional claim this turn. Call verify_directional_read first and provide its verification_id.';
  }
  const verification = minted.get(submitted.verification_id);
  if (!verification) {
    return 'rejected: verification_id was not returned by this turn\'s verify_directional_read. Fabricated or reused verifications are not accepted.';
  }
  if (!verification.data_complete && submitted.claim_status !== 'insufficient') {
    return `rejected: verification data is incomplete (${verification.notes.join(' ')}). Only insufficient may be submitted; do not take a side.`;
  }
  if (verification.breakout_verdict === 'contradicted' && submitted.claim_status === 'supported') {
    return 'rejected: mechanical verification is contradicted because neither current price nor the intraday high exceeded the premarket high. supported cannot be submitted; clearly correct the user when data conflicts.';
  }
  return null;
}
