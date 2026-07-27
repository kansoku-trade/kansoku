import type { TrainerDirection, TrainerView } from '@kansoku/pro-api';
import type { RawBar } from '@kansoku/shared/types';
import {
  clampStop,
  clampTarget,
  directedDraft,
  lastClose,
  roundPrice,
  type OrderDraft,
} from './orderDraft';

export const SWING_LOOKBACK_BARS = 60;
export const SWING_PIVOT_STRENGTH = 2;
export const QUICK_ENTRY_REWARD_RISK = 2;

const PRICE_TICK = 0.01;

// Rounds away from entry, never toward it. Rounding to nearest would leave the reward a hair short
// of the ratio in binary floating point, and the ratio readout floors — so a plan built at 2 : 1
// would display "1.99 : 1", one tick from the price at which the panel refuses the order.
function awayFromEntry(direction: TrainerDirection, price: number): number {
  return direction === 'long' ? Math.ceil(price * 100) / 100 : Math.floor(price * 100) / 100;
}

function swingExtreme(bar: RawBar, direction: TrainerDirection): number {
  return Number(direction === 'long' ? bar.low : bar.high);
}

function isPivot(extremes: number[], index: number, direction: TrainerDirection): boolean {
  const pivot = extremes[index];
  if (!Number.isFinite(pivot)) return false;
  for (let offset = 1; offset <= SWING_PIVOT_STRENGTH; offset++) {
    const before = extremes[index - offset];
    const after = extremes[index + offset];
    if (!Number.isFinite(before) || !Number.isFinite(after)) return false;
    const clears =
      direction === 'long' ? pivot < before && pivot < after : pivot > before && pivot > after;
    if (!clears) return false;
  }
  return true;
}

function beyondPivot(direction: TrainerDirection, pivot: number): number {
  return roundPrice(direction === 'long' ? pivot - PRICE_TICK : pivot + PRICE_TICK);
}

// `bars` must be the revealed series the chart is drawn from. A stop derived from a bar the
// trader has not been shown would put an unrevealed price on screen, which is the one thing the
// blind replay exists to prevent.
export function swingStopPrice(
  direction: TrainerDirection,
  entry: number,
  bars: readonly RawBar[],
): number | null {
  const window = bars.slice(-SWING_LOOKBACK_BARS);
  const extremes = window.map((bar) => swingExtreme(bar, direction));
  const beyondEntry = (price: number) =>
    Number.isFinite(price) && (direction === 'long' ? price < entry : price > entry);

  for (let i = extremes.length - 1 - SWING_PIVOT_STRENGTH; i >= SWING_PIVOT_STRENGTH; i--) {
    if (isPivot(extremes, i, direction) && beyondEntry(extremes[i])) {
      return beyondPivot(direction, extremes[i]);
    }
  }

  const finite = extremes.filter((price) => Number.isFinite(price));
  if (finite.length === 0) return null;
  const edge = direction === 'long' ? Math.min(...finite) : Math.max(...finite);
  return beyondEntry(edge) ? beyondPivot(direction, edge) : null;
}

export function quickEntryDraft(view: TrainerView, direction: TrainerDirection): OrderDraft | null {
  const entry = lastClose(view);
  const swing = swingStopPrice(direction, entry, view.bars.base);
  if (swing === null) return null;
  const stop = clampStop(direction, entry, swing);
  const reward = Math.abs(entry - stop) * QUICK_ENTRY_REWARD_RISK;
  const target = awayFromEntry(direction, direction === 'long' ? entry + reward : entry - reward);
  return directedDraft(direction, entry, { stop, target: clampTarget(direction, entry, target) });
}
