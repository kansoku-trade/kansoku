import { useState } from 'react';
import type { TrainerDirection, TrainerView } from '@kansoku/pro-api';
import {
  clampStop,
  clampTarget,
  directedDraft,
  lastClose,
  roundPrice,
  type OrderDraft,
} from './orderDraft';
import { quickEntryDraft } from './quickEntry';

type EntryAutoFill = 'none' | 'filled' | 'unavailable';

type EntryLevelField = 'stop' | 'target';

// Either leg may be unset: the levels are pulled out of the entry ticket one at a time (TP / SL),
// so a plan spends real time half-drawn.
interface PartialPlacement {
  stop: number | null;
  target: number | null;
}

export interface EntryDraftApi {
  direction: TrainerDirection | null;
  placement: PartialPlacement;
  draft: OrderDraft | null;
  entry: number;
  autoFill: EntryAutoFill;
  stale: boolean;
  pickDirection: (next: TrainerDirection) => void;
  quickEntry: (next: TrainerDirection) => void;
  setLevel: (field: EntryLevelField, price: number) => void;
  clear: () => void;
}

const EMPTY: PartialPlacement = { stop: null, target: null };

export function useEntryDraft(view: TrainerView, onTakeChart?: () => void): EntryDraftApi {
  const [direction, setDirection] = useState<TrainerDirection | null>(null);
  const [placement, setPlacement] = useState<PartialPlacement>(EMPTY);
  const [autoFill, setAutoFill] = useState<EntryAutoFill>('none');

  const entry = lastClose(view);
  // Re-resolved against the live entry on every render, so a plan the price has since run past
  // stops being a plan instead of quietly meaning something else.
  const draft =
    direction && placement.stop !== null && placement.target !== null
      ? directedDraft(direction, entry, { stop: placement.stop, target: placement.target })
      : null;

  // Pressing the side you are already on backs out; pressing the other side keeps whatever has been
  // pulled out so far, mirrored onto the new side by the clamps in setLevel.
  const pickDirection = (next: TrainerDirection) => {
    onTakeChart?.();
    setAutoFill('none');
    if (direction === next) {
      setDirection(null);
      setPlacement(EMPTY);
      return;
    }
    setDirection(next);
    setPlacement(EMPTY);
  };

  // Skips the pulls entirely: the stop comes from the revealed swing structure and the target from
  // the default reward-to-risk, leaving one click (a size preset) between here and being in. Both
  // levels stay draggable afterwards, exactly as if they had been pulled out by hand.
  const quickEntry = (next: TrainerDirection) => {
    onTakeChart?.();
    setDirection(next);
    const auto = quickEntryDraft(view, next);
    if (!auto) {
      setPlacement(EMPTY);
      setAutoFill('unavailable');
      return;
    }
    setPlacement({ stop: auto.stop, target: auto.target1 });
    setAutoFill('filled');
  };

  return {
    direction,
    placement,
    draft,
    entry,
    autoFill,
    stale:
      draft === null && direction !== null && placement.stop !== null && placement.target !== null,
    pickDirection,
    quickEntry,
    // Clamped rather than rejected: a level dragged onto the wrong side of entry is a slip of the
    // hand, and snapping it to the nearest legal price keeps the plan intact where refusing the
    // whole gesture would throw away the other leg too.
    setLevel: (field, price) => {
      if (!direction) return;
      setAutoFill('none');
      const rounded = roundPrice(price);
      setPlacement((prev) =>
        field === 'stop'
          ? { ...prev, stop: clampStop(direction, entry, rounded) }
          : { ...prev, target: clampTarget(direction, entry, rounded) },
      );
    },
    clear: () => {
      setPlacement(EMPTY);
      setDirection(null);
      setAutoFill('none');
    },
  };
}
