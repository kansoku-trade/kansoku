import type { TrainerDirection, TrainerView } from '@kansoku/pro-api';
import { lastClose } from './orderDraft';

export interface TrainerReturns {
  tradeR: number | null;
  tradePct: number | null;
  sessionR: number;
}

// `view.netR` sums the closed trades only (episodeNetR in the engine), so adding the open trade's
// equity here double-counts nothing. The engine's closed netR is gross minus friction, so the open
// trade subtracts the friction it has already paid — otherwise the two numbers on the same lane
// would be quoted on different bases. The part still open has not paid its exit cost yet.
export function episodeReturns(view: TrainerView, at?: number): TrainerReturns {
  const position = view.position;
  if (!position || position.riskUnit <= 0) {
    return { tradeR: null, tradePct: null, sessionR: view.netR };
  }
  const price = at ?? lastClose(view);
  const sign = position.direction === 'long' ? 1 : -1;
  let openSize = 0;
  let openCost = 0;
  let unrealizedR = 0;
  for (const lot of position.lots) {
    if (lot.remaining <= 0) continue;
    openSize += lot.remaining;
    openCost += lot.price * lot.remaining;
    unrealizedR += ((price - lot.price) * sign * lot.remaining) / position.riskUnit;
  }
  // Equity, not just the unrealised part: a trade that has banked half its size at +2R is up 1R
  // even when what is left sits back at its entry.
  const tradeR = position.realizedR - position.realizedFrictionR + unrealizedR;
  const breakeven = openSize > 0 ? openCost / openSize : 0;
  return {
    tradeR,
    tradePct: breakeven > 0 ? ((price - breakeven) * sign * 100) / breakeven : null,
    sessionR: view.netR + tradeR,
  };
}

// The stop is what defines one unit of risk, so it is all that is needed to price a level — the
// target does not have to exist yet. That keeps the stop reading exactly -1R from the moment it is
// dropped, instead of showing an em dash until the target catches up.
export interface RiskBasis {
  direction: TrainerDirection;
  entry: number;
  stop: number;
}

// What the trade is worth if price reaches `at`, in the same R the lane quotes — so the number on a
// level's pill and the number on the lane can never be computed two different ways. For a position
// this is the equity curve evaluated at that price; before entry, the plan has no realised part and
// a level is worth its distance from entry in risk units, which puts the stop at exactly −1R.
export function levelR(view: TrainerView, basis: RiskBasis | null, at: number): number | null {
  if (view.position && view.position.riskUnit > 0) {
    return episodeReturns(view, at).tradeR;
  }
  if (!basis) return null;
  const risk = Math.abs(basis.entry - basis.stop);
  if (risk <= 0) return null;
  const sign = basis.direction === 'long' ? 1 : -1;
  return ((at - basis.entry) * sign) / risk;
}
