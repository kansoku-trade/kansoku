import type {
  TrainerAnchor,
  TrainerBasePeriod,
  TrainerDirection,
  TrainerPosition,
  TrainerReason,
  TrainerReasonCategory,
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

// Every reason the trainer sends crosses a boundary that validates summary with minLength 1
// (episodeTradeReasonSchema), so an untyped field cannot be sent as an empty string — and a hold
// while pending/open is refused outright without a reason. This is the wording that records
// "the trader gave none", matching the string the engine itself falls back to for a submission
// with no decision_reason, so a reviewer reads one phrase for one meaning.
export const NO_REASON_GIVEN = '未提供明确的交易理由。';

const SIZE_EPSILON = 1e-9;

// An empty field also drops the category: claiming 'risk_management' or 'thesis_invalidated' for
// words the trader never wrote would attribute a rationale to them.
export function reasonOrNotGiven(category: TrainerReasonCategory, text: string): TrainerReason {
  const summary = text.trim();
  return summary.length > 0
    ? { category, summary }
    : { category: 'other', summary: NO_REASON_GIVEN };
}

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

// Direction is chosen before the chart is touched, so the drag only has to land the stop on the
// losing side of entry and the target on the winning side. A drag that puts either on the wrong
// side returns null rather than being clamped into shape: clamping would submit prices the trader
// never drew. Recomputed against the live entry on every render, so a plan the price has since run
// past stops resolving instead of quietly meaning something else.
export function directedDraft(
  direction: TrainerDirection,
  entry: number,
  placement: Placement,
): OrderDraft | null {
  const stop = roundPrice(placement.stop);
  const target1 = roundPrice(placement.target);
  const stopOnLosingSide = direction === 'long' ? stop <= entry - MIN_GAP : stop >= entry + MIN_GAP;
  const targetOnWinningSide =
    direction === 'long' ? target1 >= entry + MIN_GAP : target1 <= entry - MIN_GAP;
  return stopOnLosingSide && targetOnWinningSide ? { direction, entry, stop, target1 } : null;
}

export function openPositionSize(position: TrainerPosition): number {
  return position.lots.reduce((total, lot) => total + lot.remaining, 0);
}

export function canAddSize(position: TrainerPosition, size: number): boolean {
  return openPositionSize(position) + size <= FULL_POSITION + SIZE_EPSILON;
}

// 全仓 on the add row means "fill up to 100%", not "add another full position".
export function addToFullSize(position: TrainerPosition): number {
  return FULL_POSITION - openPositionSize(position);
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
    decision_reason: reasonOrNotGiven('other', reason),
    comment: '',
  };
}
