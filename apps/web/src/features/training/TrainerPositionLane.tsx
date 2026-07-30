import type { TrainerPosition, TrainerView } from '@kansoku/pro-api';
import { fmt, signed } from '@web/lib/format';
import type { OrderZoneData } from '../charts/intraday/orderZonePrimitive';
import type { DrawingChartHandle } from '../charts/intraday/useIntradayCharts';
import { levelR } from './episodeReturns';
import {
  addToFullSize,
  canAddSize,
  canReduceSize,
  formatPositionSize,
  FULL_POSITION,
  lastClose,
  openPositionSize,
  SIZE_PRESETS,
  type AmendDraft,
} from './orderDraft';
import { sec } from './replayBands';
import { TrainerNote } from './TrainerNote';
import { TrainerOrderLevels } from './TrainerOrderLevels';
import { TrainerOverlayPortal } from './trainerOverlay';
import type { AmendVerdict } from './useAmendCheck';

export interface TrainerPositionLaneProps {
  view: TrainerView;
  position: TrainerPosition;
  amendDraft: AmendDraft;
  verdict: AmendVerdict | null;
  handle: DrawingChartHandle | null;
  note: string;
  onNoteChange: (value: string) => void;
  onConfirmAmend: () => void;
  onRevertAmend: () => void;
  onLevelDrag: (field: 'stop' | 'target', price: number) => void;
  onLevelDragEnd: () => void;
  onAdd: (size: number) => void;
  onReduce: (size: number | null) => void;
  submitting: boolean;
}

export function TrainerPositionLane({
  view,
  position,
  amendDraft,
  verdict,
  handle,
  note,
  onNoteChange,
  onConfirmAmend,
  onRevertAmend,
  onLevelDrag,
  onLevelDragEnd,
  onAdd,
  onReduce,
  submitting,
}: TrainerPositionLaneProps) {
  const held = openPositionSize(position);
  const headroom = addToFullSize(position);
  const long = position.direction === 'long';

  const stopMoved = amendDraft.stop !== position.stop;
  const targetMoved = amendDraft.target !== position.target;
  const pendingNote =
    verdict === null ? '校验中…' : verdict.allowed ? null : (verdict.error ?? '这笔调整不被允许');
  const blocked = submitting || !verdict?.allowed;
  const rAt = (price: number) => {
    const r = levelR(view, null, price);
    return r === null ? '—' : `${signed(r, 1)}R`;
  };
  const zone: OrderZoneData = {
    startTime: sec(position.entryTime),
    entry: position.entryPrice,
    stop: amendDraft.stop,
    target: amendDraft.target,
    filled: true,
    rewardR: levelR(view, null, amendDraft.target),
    riskR: levelR(view, null, amendDraft.stop) ?? -1,
    belowFloor: false,
  };

  return (
    <>
      <TrainerOverlayPortal slot="stack">
        <div className="trainer-chip">
          <b className={long ? 'trainer-chip-long' : 'trainer-chip-short'}>
            {long ? '多头' : '空头'}
          </b>
          <span>仓位 {formatPositionSize(held)}</span>
          <span>@{fmt(position.entryPrice)}</span>
        </div>
      </TrainerOverlayPortal>
      <TrainerOrderLevels
        handle={handle}
        filled
        zone={zone}
        target={{
          price: amendDraft.target,
          text: rAt(amendDraft.target),
          draggable: true,
          ...(targetMoved
            ? { pending: { from: position.target, note: pendingNote, blocked } }
            : {}),
        }}
        entry={{
          price: position.entryPrice,
          badge: `${long ? '多头' : '空头'} ${formatPositionSize(held)}`,
          text: rAt(lastClose(view)),
          draggable: false,
        }}
        stop={{
          price: amendDraft.stop,
          text: rAt(amendDraft.stop),
          draggable: true,
          ...(stopMoved ? { pending: { from: position.stop, note: pendingNote, blocked } } : {}),
        }}
        onDrag={(kind, price) => onLevelDrag(kind === 'stop' ? 'stop' : 'target', price)}
        onDragEnd={onLevelDragEnd}
        onConfirm={onConfirmAmend}
        onRevert={onRevertAmend}
        dismiss={{ label: '平仓全部', onDismiss: () => onReduce(null) }}
      />
      <div className="trainer-lane">
        <span className="trainer-lane-label">加仓</span>
        <div className="trainer-lane-group">
          {SIZE_PRESETS.map(({ label, size }) => {
            const addSize = size === FULL_POSITION ? headroom : size;
            return (
              <button
                key={label}
                className="btn"
                aria-label={`加仓 ${label}`}
                disabled={submitting || addSize <= 0 || !canAddSize(position, addSize)}
                onClick={() => onAdd(addSize)}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="trainer-lane-sep" />
        <span className="trainer-lane-label">平仓</span>
        <div className="trainer-lane-group">
          {SIZE_PRESETS.map(({ label, size }) => {
            // 全仓 sends an unsized reduce — "close whatever is left" — so it stays available on a
            // part-filled holding that a literal 1.0 fraction would exceed.
            const closesEverything = size === FULL_POSITION;
            return (
              <button
                key={label}
                className={closesEverything ? 'btn btn--accent' : 'btn'}
                aria-label={`平仓 ${label}`}
                disabled={submitting || (!closesEverything && !canReduceSize(position, size))}
                onClick={() => onReduce(closesEverything ? null : size)}
              >
                {label}
              </button>
            );
          })}
        </div>
        <span className="trainer-lane-spacer" />
        <span className="trainer-lane-hint">止损和目标直接在图上拖</span>
        <TrainerNote
          label="备注"
          value={note}
          onChange={onNoteChange}
          hint="这笔操作的理由，可以留空"
        />
      </div>
    </>
  );
}
