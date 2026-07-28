import type { TrainerClosedTrade } from './trainerTypes.js';

/**
 * The per-trade arithmetic the settlement panel and the cross-session statistics both quote.
 *
 * It sits in the contract package because both readers live on opposite sides of the open-core
 * boundary — `apps/web` may not import `apps/pro` — and a second copy of "what the plan was worth"
 * would drift from the first the moment either side is touched.
 */

/**
 * Judged at the first fill, never at the average of the lots: `initialRisk` is the risk unit the
 * engine locked against that same first price, so pairing it with a post-add average would produce
 * a ratio measured with two different rulers.
 */
export function trainerFirstFillPrice(trade: TrainerClosedTrade): number {
  return trade.lots?.[0]?.price ?? trade.entry.price;
}

export function trainerPlannedRewardRisk(trade: TrainerClosedTrade): number | null {
  if (trade.initialRisk <= 0) return null;
  return Math.abs(trade.target - trainerFirstFillPrice(trade)) / trade.initialRisk;
}

/** Profit that showed up on the screen and was handed back. Never negative. */
export function trainerMfeGivebackR(trade: TrainerClosedTrade): number {
  return Math.max(0, trade.mfeR - trade.netR);
}
