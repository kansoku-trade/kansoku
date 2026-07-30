import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { theme } from '@web/lib/theme';
import { addPriceLine } from '../charts/lw';
import type { OrderZoneData } from '../charts/intraday/orderZonePrimitive';
import type { DrawingChartHandle } from '../charts/intraday/useIntradayCharts';
import { beginCursorLock, endCursorLock } from './cursorLock';
import { TrainerOrderLevelLabel } from './TrainerOrderLevelLabel';
import { TrainerOverlayPortal, useTrainerOverlayFrame } from './trainerOverlay';
import { useOrderZone } from './useOrderZone';
import { usePinnedPriceYs } from './usePinnedPriceY';

export type LevelKind = 'target' | 'entry' | 'stop';
// The entry is never grabbable: it is the fill price, not a level the trader places.
export type DraggableKind = Exclude<LevelKind, 'entry'>;

const PILL_MIN_GAP_PX = 26;
const LANE_STEP_PX = 80;

const LEVEL_LINE_COLOR: Record<DraggableKind, string> = {
  target: theme.up,
  stop: theme.down,
};

export interface OrderLevel {
  price: number;
  // The headline the pill carries: what this level is worth in R, or how the entry is filling.
  text: string;
  badge?: string;
  draggable: boolean;
  pending?: { from: number; note: string | null; blocked: boolean };
  // TP / SL pulls live on the entry ticket, the way a chart-native order sprouts its brackets:
  // drag one out and the level it names appears where it is dropped. `set` only changes how it
  // reads — both stay draggable, so a bracket already placed is re-pulled the same way.
  pulls?: { field: 'target' | 'stop'; label: string; set: boolean }[];
}

export interface LevelSubmitConfig {
  label: string;
  disabled: boolean;
  blockedReason?: string;
  onSubmit: (size: number) => void;
}

export interface LevelDismissConfig {
  label: string;
  onDismiss: () => void;
}

export interface TrainerOrderLevelsProps {
  handle: DrawingChartHandle | null;
  target: OrderLevel | null;
  entry: OrderLevel | null;
  stop: OrderLevel | null;
  filled?: boolean;
  zone?: OrderZoneData | null;
  // A drawing tool and the levels both want pointerdown on this pane, so only one of them ever has
  // it: while a tool is armed the hit bands and the TP/SL pulls come off entirely, rather than
  // staying on screen as full-width strips that would swallow the stroke being drawn.
  dragDisabled?: boolean;
  onDrag?: (kind: DraggableKind, price: number) => void;
  onDragEnd?: () => void;
  onConfirm?: () => void;
  onRevert?: () => void;
  // Sending the order from the ticket itself: the plan is already under the pointer here, so there
  // is no reason to travel back to the lane to commit it.
  submit?: LevelSubmitConfig;
  dismiss?: LevelDismissConfig;
}

// Stop and target have no dismiss: the engine refuses a submission that is missing either, so a
// control that removed one could never be honoured. Only the entry carries one, where it means
// "drop this plan" before a fill and "close it out" after.
export function TrainerOrderLevels({
  handle,
  target,
  entry,
  stop,
  filled = false,
  zone,
  dragDisabled = false,
  onDrag,
  onDragEnd,
  onConfirm,
  onRevert,
  submit,
  dismiss,
}: TrainerOrderLevelsProps) {
  const frame = useTrainerOverlayFrame();
  const { ys, pane } = usePinnedPriceYs(handle, frame, {
    target: target?.price ?? null,
    entry: entry?.price ?? null,
    stop: stop?.price ?? null,
  });
  useOrderZone(handle, zone ?? null);

  // Leaving the drag half-applied would strand the whole document in a resize cursor, so the
  // teardown is reachable from unmount as well as from the pointer release — the same path also
  // removes the axis price line, so it cannot outlive the drag if the component unmounts mid-drag.
  const endDragRef = useRef<(() => void) | null>(null);
  useEffect(() => () => endDragRef.current?.(), []);

  const [draggingKind, setDraggingKind] = useState<DraggableKind | null>(null);

  // Dragging the pill, the hit band or a pull is the same gesture as dragging the line, so all
  // three go through the same price callback rather than a second path that could round
  // differently.
  const startDrag = (kind: DraggableKind) => (event: ReactPointerEvent<HTMLElement>) => {
    if (!handle || !onDrag) return;
    event.preventDefault();
    event.stopPropagation();
    // The pointer spends the whole drag away from the handle it grabbed — over the canvas, the
    // price axis, past the edge of the pane — and the cursor would otherwise flip to whatever each
    // of those uses. A document-level lock keeps the grab legible until the release.
    beginCursorLock();
    setDraggingKind(kind);

    const priceAt = (clientY: number) => {
      const top = handle.container.getBoundingClientRect().top;
      return handle.series.coordinateToPrice(clientY - top);
    };

    let priceLine: ReturnType<typeof addPriceLine> | null = null;
    const showPriceLine = (price: number) => {
      if (priceLine) {
        priceLine.applyOptions({ price });
        return;
      }
      priceLine = addPriceLine(handle.series, {
        price,
        color: LEVEL_LINE_COLOR[kind],
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
      });
    };
    const initialPrice = priceAt(event.clientY);
    if (initialPrice !== null) showPriceLine(initialPrice);

    const move = (moved: PointerEvent) => {
      const price = priceAt(moved.clientY);
      if (price === null) return;
      showPriceLine(price);
      onDrag(kind, price);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      endCursorLock();
      if (priceLine) handle.series.removePriceLine(priceLine);
      endDragRef.current = null;
      setDraggingKind(null);
      onDragEnd?.();
    };
    endDragRef.current = up;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const dragEnabled = Boolean(handle && onDrag) && !dragDisabled;

  // A price can scale off the pane while still answering with a coordinate, which would put the
  // line — and its grabbable band — over the price axis or down on the MACD chart below.
  const rows: { kind: LevelKind; level: OrderLevel; y: number; lane: number }[] = [];
  for (const [kind, level] of [
    ['target', target],
    ['entry', entry],
    ['stop', stop],
  ] as const) {
    const y = ys[kind];
    if (!level || y === null || !pane) continue;
    if (y < pane.top || y > pane.bottom) continue;
    rows.push({ kind, level, y, lane: 0 });
  }
  if (rows.length === 0 || !pane) return null;

  // A tight stop puts all three prices within a few pixels of each other, and three tickets stacked
  // on the same spot bury one another — the entry's own text and its close button end up unreadable
  // and unclickable. Anything too close to the ticket above it steps one lane further left.
  let lane = 0;
  let previousY = -Infinity;
  for (const row of [...rows].sort((a, b) => a.y - b.y)) {
    lane = row.y - previousY < PILL_MIN_GAP_PX ? lane + 1 : 0;
    row.lane = lane;
    previousY = row.y;
  }

  return (
    <TrainerOverlayPortal slot="pinned">
      {rows.map(({ kind, level, y, lane }) => (
        <TrainerOrderLevelLabel
          key={kind}
          kind={kind}
          level={level}
          y={y}
          pane={pane}
          marginRight={70 + lane * LANE_STEP_PX}
          filled={filled && kind === 'entry'}
          dragging={draggingKind === kind}
          startDrag={dragEnabled ? startDrag : undefined}
          onGrab={dragEnabled && level.draggable && kind !== 'entry' ? startDrag(kind) : undefined}
          onConfirm={onConfirm}
          onRevert={onRevert}
          submit={kind === 'entry' ? submit : undefined}
          dismiss={kind === 'entry' ? dismiss : undefined}
        />
      ))}
    </TrainerOverlayPortal>
  );
}
