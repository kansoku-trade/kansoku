import type {
  TrainerAnchor,
  TrainerBasePeriod,
  TrainerDirection,
  TrainerPosition,
  TrainerSubmission,
  TrainerView,
} from '@kansoku/pro-api';

export interface OrderDraft {
  direction: TrainerDirection;
  entry: number;
  stop: number;
  target1: number;
}

export interface AmendDraft {
  stop: number;
  target: number;
}

export interface Placement {
  stop: number;
  target: number;
}

export const MIN_GAP = 0.01;
export const MIN_REWARD_RISK = 1.5;
export const FULL_POSITION = 1;
export const HALF_POSITION = 0.5;
export const QUARTER_POSITION = 0.25;

const SIZE_EPSILON = 1e-9;

export function roundPrice(price: number): number {
  return Math.round(price * 100) / 100;
}

export function lastClose(view: TrainerView): number {
  const bar = view.bars.base.at(-1);
  return bar ? Number(bar.close) : 0;
}

export function clampStop(direction: TrainerDirection, entry: number, price: number): number {
  return direction === 'long' ? Math.min(price, entry - MIN_GAP) : Math.max(price, entry + MIN_GAP);
}

export function clampTarget(direction: TrainerDirection, entry: number, price: number): number {
  return direction === 'long' ? Math.max(price, entry + MIN_GAP) : Math.min(price, entry - MIN_GAP);
}

// The gesture is the direction call: press below the entry line and release above it and you have
// drawn a long, the mirror image a short. A drag that stays on one side has drawn a stop and a
// target on the same side of entry, which is not a tradeable plan in either direction — hence null
// rather than a guessed side. Recomputed against the live entry on every render, so a plan the
// price has since run past stops resolving instead of quietly meaning something else.
export function placementDraft(entry: number, placement: Placement): OrderDraft | null {
  const stop = roundPrice(placement.stop);
  const target1 = roundPrice(placement.target);
  if (stop <= entry - MIN_GAP && target1 >= entry + MIN_GAP)
    return { direction: 'long', entry, stop, target1 };
  if (stop >= entry + MIN_GAP && target1 <= entry - MIN_GAP)
    return { direction: 'short', entry, stop, target1 };
  return null;
}

export function openPositionSize(position: TrainerPosition): number {
  return position.lots.reduce((total, lot) => total + lot.remaining, 0);
}

export function canAddSize(position: TrainerPosition, size: number): boolean {
  return openPositionSize(position) + size <= FULL_POSITION + SIZE_EPSILON;
}

export function canReduceSize(position: TrainerPosition, size: number): boolean {
  return size <= openPositionSize(position) + SIZE_EPSILON;
}

export function formatPositionSize(size: number): string {
  return `${Math.round(size * 100)}%`;
}

export function rewardRiskRatio(draft: OrderDraft): number | null {
  const risk = Math.abs(draft.entry - draft.stop);
  if (risk <= 0) return null;
  const reward =
    draft.direction === 'long' ? draft.target1 - draft.entry : draft.entry - draft.target1;
  return reward / risk;
}

export function meetsRewardRiskFloor(draft: OrderDraft): boolean {
  const rr = rewardRiskRatio(draft);
  return rr !== null && rr >= MIN_REWARD_RISK;
}

// Rounds down (not to nearest), so the displayed ratio can never read as meeting
// MIN_REWARD_RISK while meetsRewardRiskFloor has locked the submit button on the same underlying
// value — e.g. 1.499 must show "1.49", not "1.50" via ordinary rounding, or the trader sees a
// ratio that claims the floor is met right where the UI is refusing the order.
export function formatRewardRisk(rr: number): string {
  return (Math.floor(rr * 100) / 100).toFixed(2);
}

const ANCHOR_TF_BY_BASE_PERIOD: Record<TrainerBasePeriod, TrainerAnchor['timeframe']> = {
  '1m': 'm5',
  '5m': 'm5',
  '15m': 'm15',
  '30m': 'h1',
  '1h': 'h1',
};

export function deriveAnchor(view: TrainerView): TrainerAnchor {
  const bar = view.bars.base.at(-1);
  return {
    timeframe: ANCHOR_TF_BY_BASE_PERIOD[view.basePeriod],
    time: bar?.time ?? view.asOf,
    price: bar ? Number(bar.close) : 0,
  };
}

// Entry is always the live price: the trainer only sends market orders, which fill at the next
// bar's open, so any other entry would be a price the engine never honours.
export function buildOrderSubmission(
  view: TrainerView,
  draft: OrderDraft,
  reason: string,
): TrainerSubmission {
  const entry = lastClose(view);
  return {
    direction: draft.direction,
    anchor: deriveAnchor(view),
    entry_plan: { entry, stop: draft.stop, target1: draft.target1 },
    // submitEpisode never reads scenarios (that field only feeds the AI runner's Bull/Base/Bear
    // scoring) — the trainer has none to give, so this is an honest "none supplied", not a
    // placeholder standing in for real trader input.
    scenarios: [],
    decision_reason: { category: 'other', summary: reason.trim() },
    comment: '',
  };
}
