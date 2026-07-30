import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { X } from 'lucide-react';
import { fmt } from '@web/lib/format';
import type { OrderZoneData } from '../charts/intraday/orderZonePrimitive';
import type { DrawingChartHandle } from '../charts/intraday/useIntradayCharts';
import { beginCursorLock, endCursorLock } from './cursorLock';
import { SIZE_PRESETS } from './orderDraft';
import { TrainerOverlayPortal, useTrainerOverlayFrame } from './trainerOverlay';
import { useOrderZone } from './useOrderZone';
import { usePinnedPriceYs } from './usePinnedPriceY';

export type LevelKind = 'target' | 'entry' | 'stop';

const PILL_MIN_GAP_PX = 26;
const LANE_STEP_PX = 200;

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

export interface TrainerOrderLevelsProps {
  handle: DrawingChartHandle | null;
  target: OrderLevel | null;
  entry: OrderLevel | null;
  stop: OrderLevel | null;
  filled?: boolean;
  zone?: OrderZoneData | null;
  onDrag?: (kind: LevelKind, price: number) => void;
  onDragEnd?: () => void;
  onConfirm?: () => void;
  onRevert?: () => void;
  // Sending the order from the ticket itself: the plan is already under the pointer here, so there
  // is no reason to travel back to the lane to commit it.
  submit?: {
    label: string;
    disabled: boolean;
    blockedReason?: string;
    onSubmit: (size: number) => void;
  };
  dismiss?: { label: string; onDismiss: () => void };
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
  onDrag,
  onDragEnd,
  onConfirm,
  onRevert,
  submit,
  dismiss,
}: TrainerOrderLevelsProps) {
  const frame = useTrainerOverlayFrame();
  const ys = usePinnedPriceYs(handle, frame, {
    target: target?.price ?? null,
    entry: entry?.price ?? null,
    stop: stop?.price ?? null,
  });
  useOrderZone(handle, zone ?? null);

  // Leaving the drag half-applied would strand the whole document in a resize cursor, so the
  // teardown is reachable from unmount as well as from the pointer release.
  const endDragRef = useRef<(() => void) | null>(null);
  useEffect(() => () => endDragRef.current?.(), []);

  // Dragging the pill is the same gesture as dragging the line, so it goes through the same
  // price callback rather than a second path that could round differently.
  const startDrag = (kind: LevelKind) => (event: ReactPointerEvent<HTMLElement>) => {
    if (!handle || !onDrag) return;
    event.preventDefault();
    event.stopPropagation();
    // The pointer spends the whole drag away from the handle it grabbed — over the canvas, the
    // price axis, past the edge of the pane — and the cursor would otherwise flip to whatever each
    // of those uses. A document-level lock keeps the grab legible until the release.
    beginCursorLock();
    const move = (moved: PointerEvent) => {
      const top = handle.container.getBoundingClientRect().top;
      const price = handle.series.coordinateToPrice(moved.clientY - top);
      if (price !== null) onDrag(kind, price);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      endCursorLock();
      endDragRef.current = null;
      onDragEnd?.();
    };
    endDragRef.current = up;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const rows: { kind: LevelKind; level: OrderLevel; y: number; lane: number }[] = [];
  for (const [kind, level] of [
    ['target', target],
    ['entry', entry],
    ['stop', stop],
  ] as const) {
    const y = ys[kind];
    if (level && y !== null) rows.push({ kind, level, y, lane: 0 });
  }
  if (rows.length === 0) return null;

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
        <div
          key={kind}
          className={`trainer-level trainer-level--${kind}${filled && kind === 'entry' ? ' trainer-level--filled' : ''}`}
          style={{ top: `${y}px` }}
        >
          <div className="trainer-level-line" />
          <div
            className={`trainer-level-pill${level.draggable ? ' trainer-level-pill--drag' : ''}`}
            style={lane > 0 ? { marginRight: `${70 + lane * LANE_STEP_PX}px` } : undefined}
            onPointerDown={level.draggable ? startDrag(kind) : undefined}
          >
            {level.draggable && (
              <span className="trainer-level-grip" aria-hidden="true">
                ⇅
              </span>
            )}
            {level.badge && <span className="trainer-level-badge">{level.badge}</span>}
            {level.pulls?.map((pull) => (
              <button
                key={pull.field}
                className={`trainer-level-pull trainer-level-pull--${pull.field}${pull.set ? ' trainer-level-pull--set' : ''}`}
                aria-label={`拖出${pull.label}`}
                title={pull.set ? `拖动改${pull.label}` : `按住往图上拖，放下就是${pull.label}`}
                onPointerDown={startDrag(pull.field)}
              >
                {pull.label}
              </button>
            ))}
            {/* Old price first, then the arrow, then where it is being moved to — the move has to
                read in the direction it happens. */}
            <span className="trainer-level-price">
              {level.pending && (
                <>
                  <span className="trainer-level-was">{fmt(level.pending.from)}</span>
                  <span className="trainer-chip-dim"> → </span>
                </>
              )}
              {fmt(level.price)}
            </span>
            <span className="trainer-level-sep" />
            {level.pending ? (
              <>
                {level.pending.note && (
                  <span
                    className={level.pending.blocked ? 'trainer-level-blocked' : 'trainer-chip-dim'}
                    role={level.pending.blocked ? 'status' : undefined}
                  >
                    {level.pending.note}
                  </span>
                )}
                <button
                  className="trainer-level-act trainer-level-act--ok"
                  disabled={level.pending.blocked}
                  onClick={onConfirm}
                >
                  确认调整
                </button>
                <button className="trainer-level-act" aria-label="撤销调整" onClick={onRevert}>
                  撤销
                </button>
              </>
            ) : (
              <span className="trainer-level-text">{level.text}</span>
            )}
            {kind === 'entry' && submit && (
              <>
                <span className="trainer-level-sep" />
                <span className="trainer-level-submit-label">进场</span>
                {SIZE_PRESETS.map(({ label, size }) => (
                  <button
                    key={label}
                    className="trainer-level-act trainer-level-act--go"
                    aria-label={`${submit.label} ${label}`}
                    disabled={submit.disabled}
                    title={submit.blockedReason ?? `${submit.label} ${label}`}
                    onClick={() => submit.onSubmit(size)}
                  >
                    {label}
                  </button>
                ))}
              </>
            )}
            {kind === 'entry' && dismiss && (
              <button
                className="trainer-level-act trainer-level-act--x"
                aria-label={dismiss.label}
                title={dismiss.label}
                onClick={dismiss.onDismiss}
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      ))}
    </TrainerOverlayPortal>
  );
}
