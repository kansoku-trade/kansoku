import type {
  TrainerAnchor,
  TrainerBasePeriod,
  TrainerDirection,
  TrainerSubmission,
  TrainerView,
} from '@kansoku/pro-api';

export interface OrderDraft {
  direction: TrainerDirection;
  entry: number;
  stop: number;
  target1: number;
}

export const MIN_GAP = 0.01;
export const MIN_REWARD_RISK = 1.5;

function roundPrice(price: number): number {
  return Math.round(price * 100) / 100;
}

export function lastClose(view: TrainerView): number {
  const bar = view.bars.base.at(-1);
  return bar ? Number(bar.close) : 0;
}

export function defaultOrderDraft(view: TrainerView): OrderDraft {
  const entry = lastClose(view);
  return {
    direction: 'long',
    entry,
    stop: roundPrice(entry * 0.99),
    target1: roundPrice(entry * 1.02),
  };
}

export function clampStop(direction: TrainerDirection, entry: number, price: number): number {
  return direction === 'long' ? Math.min(price, entry - MIN_GAP) : Math.max(price, entry + MIN_GAP);
}

export function clampTarget(direction: TrainerDirection, entry: number, price: number): number {
  return direction === 'long' ? Math.max(price, entry + MIN_GAP) : Math.min(price, entry - MIN_GAP);
}

export function withDirection(prev: OrderDraft, direction: TrainerDirection): OrderDraft {
  if (direction === prev.direction) return prev;
  const { entry } = prev;
  return {
    direction,
    entry,
    stop: clampStop(direction, entry, entry + (entry - prev.stop)),
    target1: clampTarget(direction, entry, entry + (entry - prev.target1)),
  };
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

export function buildOrderSubmission(
  view: TrainerView,
  draft: OrderDraft,
  entryMode: 'limit' | 'market',
): TrainerSubmission {
  const entry = entryMode === 'market' ? lastClose(view) : draft.entry;
  return {
    direction: draft.direction,
    anchor: deriveAnchor(view),
    entry_plan: { entry, stop: draft.stop, target1: draft.target1 },
    // submitEpisode never reads scenarios (that field only feeds the AI runner's Bull/Base/Bear
    // scoring) — the trainer has none to give, so this is an honest "none supplied", not a
    // placeholder standing in for real trader input.
    scenarios: [],
    comment: '',
  };
}
