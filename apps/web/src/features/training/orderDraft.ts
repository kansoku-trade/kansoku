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

const MIN_GAP = 0.01;

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
  return direction === 'long'
    ? Math.min(price, entry - MIN_GAP)
    : Math.max(price, entry + MIN_GAP);
}

export function clampTarget(direction: TrainerDirection, entry: number, price: number): number {
  return direction === 'long'
    ? Math.max(price, entry + MIN_GAP)
    : Math.min(price, entry - MIN_GAP);
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
    scenarios: [
      { label: '按计划触发目标', probability: 60 },
      { label: '触发止损', probability: 40 },
    ],
    comment: '',
  };
}
