import { useEffect, useRef, useState } from 'react';
import type {
  TrainerDirection,
  TrainerEnvelope,
  TrainerOrder,
  TrainerPosition,
  TrainerStepResult,
  TrainerView,
} from '@kansoku/pro-api';
import { fmt } from '@web/lib/format';
import { PositionBoxPrimitive } from '../charts/intraday/positionBoxPrimitive';
import type { DrawingChartHandle } from '../charts/intraday/useIntradayCharts';
import type { TrainerBridge } from '../desktop/desktopTrainerBridge';
import {
  addToFullSize,
  buildOrderSubmission,
  canAddSize,
  canReduceSize,
  clampStop,
  clampTarget,
  directedDraft,
  formatPositionSize,
  formatRewardRisk,
  FULL_POSITION,
  HALF_POSITION,
  lastClose,
  meetsRewardRiskFloor,
  openPositionSize,
  QUARTER_POSITION,
  reasonOrNotGiven,
  rewardRiskRatio,
  roundPrice,
  type AmendDraft,
  type OrderDraft,
  type Placement,
} from './orderDraft';
import { quickEntryDraft } from './quickEntry';
import { freshVerdict, useAmendCheck, type AmendVerdict } from './useAmendCheck';
import { useChartScrollLock } from './useChartScrollLock';
import { useOrderBoxDrag } from './useOrderBoxDrag';
import { useOrderPlacementDrag } from './useOrderPlacementDrag';

const BOX_SPAN_SEC = 100 * 24 * 3600;

const SIZE_PRESETS = [
  { label: '1/4', size: QUARTER_POSITION },
  { label: '1/2', size: HALF_POSITION },
  { label: '全仓', size: FULL_POSITION },
];

const DIRECTION_LABEL: Record<TrainerDirection, string> = { long: '做多', short: '做空' };

function sideRule(direction: TrainerDirection, entry: number): string {
  return direction === 'long'
    ? `止损要在入场线 ${fmt(entry)} 下方，目标要在上方`
    : `止损要在入场线 ${fmt(entry)} 上方，目标要在下方`;
}

// PositionBoxPrimitive falls back to the visible range's edges when a time falls outside the
// series' own bar range (see positionBoxPrimitive.ts), which is how this box is made to span the
// full chart width regardless of zoom. A truly extreme sentinel (e.g. Number.MAX_SAFE_INTEGER)
// does not hit that fallback — lightweight-charts' timeToCoordinate extrapolates it to a
// nonsensical finite pixel instead of returning null, collapsing the box to a sliver near the last
// bar. A bounded offset (here, 100 days past the real data) stays inside timeToCoordinate's normal
// extrapolation range while still being far outside any realistic zoom level.
function boxTimeRange(view: TrainerView): { startTime: number; endTime: number } {
  const lastBar = view.bars.base.at(-1);
  const lastTime = lastBar
    ? Math.floor(Date.parse(lastBar.time) / 1000)
    : Math.floor(Date.now() / 1000);
  return { startTime: lastTime - BOX_SPAN_SEC, endTime: lastTime + BOX_SPAN_SEC };
}

export interface TrainerOrderPanelProps {
  view: TrainerView;
  handle: DrawingChartHandle | null;
  bridge: TrainerBridge;
  sessionId: string;
  onViewChange: (view: TrainerView) => void;
  drawingActive?: boolean;
  onTakeChart?: () => void;
}

type AutoFill = 'none' | 'filled' | 'unavailable';

export function TrainerOrderPanel({
  view,
  handle,
  bridge,
  sessionId,
  onViewChange,
  drawingActive = false,
  onTakeChart,
}: TrainerOrderPanelProps) {
  const [direction, setDirection] = useState<TrainerDirection | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [missedSide, setMissedSide] = useState(false);
  const [autoFill, setAutoFill] = useState<AutoFill>('none');
  const [entryReason, setEntryReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<PositionBoxPrimitive | null>(null);
  const flat = view.phase === 'flat';
  const position = view.position;
  const order = view.order;
  const entry = lastClose(view);

  // Reset (or seed) the amend draft during render rather than in a useEffect, so a fresh
  // position's stop/target reach the input fields and the drag box on the very same commit —
  // an effect-based reset would land a frame after paint, flashing the plain status line first.
  const [amendDraft, setAmendDraft] = useState<AmendDraft | null>(null);
  const [settledAmend, setSettledAmend] = useState<AmendDraft | null>(null);
  const [amendDraftTradeId, setAmendDraftTradeId] = useState<number | null>(null);
  const [amendReason, setAmendReason] = useState('');
  const [exitReason, setExitReason] = useState('');
  const [addReason, setAddReason] = useState('');
  if (position && position.tradeId !== amendDraftTradeId) {
    setAmendDraftTradeId(position.tradeId);
    setAmendDraft({ stop: position.stop, target: position.target });
    setSettledAmend({ stop: position.stop, target: position.target });
    setAmendReason('');
    setExitReason('');
    setAddReason('');
  } else if (!position && amendDraftTradeId !== null) {
    setAmendDraftTradeId(null);
    setAmendDraft(null);
    setSettledAmend(null);
  }
  const amendDraftRef = useRef<AmendDraft | null>(null);
  amendDraftRef.current = amendDraft;

  const [cancelReason, setCancelReason] = useState('');
  const [cancelReasonOrderId, setCancelReasonOrderId] = useState<number | null>(null);
  if (order && order.tradeId !== cancelReasonOrderId) {
    setCancelReasonOrderId(order.tradeId);
    setCancelReason('');
  } else if (!order && cancelReasonOrderId !== null) {
    setCancelReasonOrderId(null);
  }

  useEffect(() => {
    if (!handle) return;
    const box = new PositionBoxPrimitive();
    handle.series.attachPrimitive(box);
    boxRef.current = box;
    return () => {
      // The chart outlives this panel — it stays mounted through the switch to the settlement
      // screen. Dropping only the ref would leave the draft box painted on the settlement chart
      // as a position that was never taken.
      box.setData(null);
      handle.series.detachPrimitive(box);
      boxRef.current = null;
    };
  }, [handle]);

  // Re-resolved against the live entry on every render, so a plan the price has since run past
  // stops being a plan instead of quietly meaning something else.
  const draft: OrderDraft | null =
    direction && placement ? directedDraft(direction, entry, placement) : null;

  const boxActive = flat ? direction !== null : position != null && amendDraft != null;
  const boxEntry = flat ? entry : (position?.entryPrice ?? 0);
  const boxStop = flat ? (placement?.stop ?? entry) : (amendDraft?.stop ?? 0);
  const boxTarget = flat ? (placement?.target ?? entry) : (amendDraft?.target ?? 0);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    if (!boxActive) {
      box.setData(null);
      return;
    }
    box.setData({
      ...boxTimeRange(view),
      entry: boxEntry,
      stop: boxStop,
      target1: boxTarget,
      target2: boxTarget,
      dimmed: false,
    });
    // handle is a dependency (unused directly in the body) because the box in boxRef.current is
    // only non-null once the sibling effect above has attached it to that handle — without this,
    // the initial draft never reaches the box: it gets attached, but this effect last ran before
    // boxRef.current existed and has no other reason to run again.
  }, [boxActive, boxEntry, boxStop, boxTarget, view, handle]);

  // Every edit stays local; only a settled one is sent to the engine's dry run, so dragging never
  // waits on an IPC round trip.
  const applyAmend = (patch: Partial<AmendDraft>, settle: boolean) => {
    if (!position) return;
    const reference = lastClose(view);
    const base = amendDraftRef.current ?? { stop: position.stop, target: position.target };
    const next: AmendDraft = {
      stop: clampStop(position.direction, reference, patch.stop ?? base.stop),
      target: clampTarget(position.direction, reference, patch.target ?? base.target),
    };
    amendDraftRef.current = next;
    setAmendDraft(next);
    if (settle) setSettledAmend(next);
  };

  // A drawing tool and the order tools both drag on this canvas, so only one of them is ever
  // attached to it: picking a drawing tool detaches both order drags, and pressing any direction
  // button calls onTakeChart to put the drawing tool back to 'off'.
  const orderHandle = drawingActive ? null : handle;
  useChartScrollLock(handle, placing || drawingActive);

  useOrderPlacementDrag(flat ? orderHandle : null, placing, {
    // The prices are set on every frame, not only on release, so the numbers about to be sent are
    // the ones on screen the whole time.
    onPreview: (stop, target) => {
      setMissedSide(false);
      setAutoFill('none');
      setPlacement({ stop, target });
    },
    onCommit: (stop, target) => {
      if (!direction) return;
      const placed = directedDraft(direction, entry, { stop, target });
      if (!placed) {
        setPlacement(null);
        setMissedSide(true);
        return;
      }
      setPlacement({ stop: placed.stop, target: placed.target1 });
      setPlacing(false);
    },
  });

  const moveDraftPrice = (field: 'stop' | 'target', price: number) => {
    if (!direction) return;
    setPlacement((prev) => {
      if (!prev) return prev;
      const rounded = roundPrice(price);
      return field === 'stop'
        ? { ...prev, stop: clampStop(direction, entry, rounded) }
        : { ...prev, target: clampTarget(direction, entry, rounded) };
    });
  };

  const edgeHandle = flat
    ? placing || !draft
      ? null
      : orderHandle
    : boxActive
      ? orderHandle
      : null;
  useOrderBoxDrag(
    edgeHandle,
    { stop: boxStop, target1: boxTarget },
    {
      onStopDrag: flat
        ? (price) => moveDraftPrice('stop', price)
        : (price) => applyAmend({ stop: price }, false),
      onTargetDrag: flat
        ? (price) => moveDraftPrice('target', price)
        : (price) => applyAmend({ target: price }, false),
      onDragEnd: flat ? undefined : () => setSettledAmend(amendDraftRef.current),
    },
  );

  const checked = useAmendCheck(bridge, sessionId, view.cursor, settledAmend);
  const verdict = freshVerdict(checked, amendDraft, view.cursor);

  const runAction = async (
    call: () => Promise<TrainerEnvelope<TrainerStepResult>>,
  ): Promise<boolean> => {
    setSubmitting(true);
    setError(null);
    const result = await call();
    setSubmitting(false);
    if (result.ok) {
      onViewChange(result.data.view);
      return true;
    }
    setError(result.error);
    if (result.view) onViewChange(result.view);
    return false;
  };

  const confirmAmend = () => {
    if (!position || !amendDraft) return;
    void runAction(() =>
      bridge.amend({
        sessionId,
        stop: amendDraft.stop,
        target: amendDraft.target,
        reason: reasonOrNotGiven('risk_management', amendReason),
      }),
    );
  };

  const confirmAdd = async (size: number) => {
    if (!position) return;
    const ok = await runAction(() =>
      bridge.add({
        sessionId,
        size,
        reason: reasonOrNotGiven('other', addReason),
      }),
    );
    if (ok) setAddReason('');
  };

  const confirmReduce = async (size: number | null) => {
    if (!position) return;
    const ok = await runAction(() =>
      bridge.reduce({
        sessionId,
        ...(size === null ? {} : { size }),
        reason: reasonOrNotGiven('other', exitReason),
      }),
    );
    if (ok) setExitReason('');
  };

  const confirmCancel = () => {
    if (!order) return;
    void runAction(() =>
      bridge.cancel({
        sessionId,
        reason: reasonOrNotGiven('thesis_invalidated', cancelReason),
      }),
    );
  };

  if (!flat) {
    if (position && amendDraft) {
      return (
        <TrainerPositionPanel
          position={position}
          amendDraft={amendDraft}
          verdict={verdict}
          amendReason={amendReason}
          onAmendReasonChange={setAmendReason}
          onStopChange={(price) => applyAmend({ stop: price }, true)}
          onTargetChange={(price) => applyAmend({ target: price }, true)}
          onConfirmAmend={confirmAmend}
          addReason={addReason}
          onAddReasonChange={setAddReason}
          onAdd={confirmAdd}
          exitReason={exitReason}
          onExitReasonChange={setExitReason}
          onReduce={confirmReduce}
          submitting={submitting}
          error={error}
        />
      );
    }
    if (order) {
      return (
        <TrainerPendingOrderPanel
          order={order}
          reason={cancelReason}
          onReasonChange={setCancelReason}
          onConfirm={confirmCancel}
          submitting={submitting}
          error={error}
        />
      );
    }
    return <div className="trainer-order-panel trainer-order-panel--status">本局已结束</div>;
  }

  const rr = draft ? rewardRiskRatio(draft) : null;
  const rrOk = draft != null && meetsRewardRiskFloor(draft);
  const stale = !placing && placement !== null && draft === null;

  // Picking a side always re-arms the chart, so the same button doubles as "redraw"; pressing the
  // side you are already on with nothing drawn backs out instead, which is the only way to hand
  // panning back to the chart once the placement drag has locked it.
  const pickDirection = (next: TrainerDirection) => {
    onTakeChart?.();
    setMissedSide(false);
    setAutoFill('none');
    if (direction === next && placement === null) {
      setDirection(null);
      setPlacing(false);
      return;
    }
    setDirection(next);
    setPlacement(null);
    setPlacing(true);
  };

  // Skips the drag entirely: the stop comes from the revealed swing structure and the target from
  // the default reward-to-risk, leaving one click (a size preset) between here and being in. Both
  // lines stay draggable afterwards, exactly as if they had been drawn by hand.
  const quickEntry = (next: TrainerDirection) => {
    onTakeChart?.();
    setMissedSide(false);
    setPlacing(false);
    setDirection(next);
    const auto = quickEntryDraft(view, next);
    if (!auto) {
      setPlacement(null);
      setAutoFill('unavailable');
      setPlacing(true);
      return;
    }
    setPlacement({ stop: auto.stop, target: auto.target1 });
    setAutoFill('filled');
  };

  const submit = async (size: number) => {
    if (!draft) return;
    setSubmitting(true);
    setError(null);
    const submission = buildOrderSubmission(view, draft, entryReason);
    const result = await bridge.submit({ sessionId, submission, entryMode: 'market', size });
    setSubmitting(false);
    if (result.ok) {
      setEntryReason('');
      setPlacement(null);
      setDirection(null);
      setAutoFill('none');
      onViewChange(result.data.view);
      return;
    }
    setError(result.error);
    if (result.view) onViewChange(result.view);
  };

  const hint = ((): { text: string; warn: boolean } => {
    if (!direction)
      return {
        text: '先选做多还是做空，再到图上拖一条：按下是止损，松手是目标；想直接进就按市价',
        warn: false,
      };
    if (missedSide) return { text: `${sideRule(direction, entry)}，再拖一次`, warn: true };
    if (autoFill === 'unavailable')
      return { text: '已经走出来的这段里找不到能放止损的位置，请自己在图上拖一条', warn: true };
    if (stale)
      return {
        text: `现价 ${fmt(entry)} 已经越过你画的线，再按一次「${DIRECTION_LABEL[direction]}」重画`,
        warn: true,
      };
    if (placing) return { text: `在图上按住拖动：${sideRule(direction, entry)}`, warn: false };
    if (autoFill === 'filled')
      return {
        text: '止损放在最近一个摆动低/高点外一档，目标按 2 : 1 铺好；两条线都能拖，也可以直接选仓位进场',
        warn: false,
      };
    return { text: `再按一次「${DIRECTION_LABEL[direction]}」可以重画`, warn: false };
  })();

  return (
    <div className="trainer-order-panel">
      <div className="trainer-order-row trainer-size-group">
        <span className="trainer-size-label">方向</span>
        <button
          className="btn"
          aria-pressed={direction === 'long'}
          onClick={() => pickDirection('long')}
        >
          做多
        </button>
        <button
          className="btn"
          aria-pressed={direction === 'short'}
          onClick={() => pickDirection('short')}
        >
          做空
        </button>
        <span className="trainer-size-label">快捷</span>
        <button className="btn btn--accent" onClick={() => quickEntry('long')}>
          市价做多
        </button>
        <button className="btn btn--accent" onClick={() => quickEntry('short')}>
          市价做空
        </button>
      </div>
      <div className="trainer-order-row">
        <span className={`trainer-order-hint${hint.warn ? ' trainer-order-field--warn' : ''}`}>
          {hint.text}
        </span>
      </div>
      {draft && (
        <>
          <div className="trainer-order-row trainer-order-readout">
            <span>入场 {fmt(draft.entry)}</span>
            <span>止损 {fmt(draft.stop)}</span>
            <span className={rrOk ? undefined : 'trainer-order-field--warn'}>
              目标 {fmt(draft.target1)}
            </span>
            <span className={`trainer-order-rr${rrOk ? '' : ' trainer-order-field--warn'}`}>
              盈亏比 {rr === null ? '—' : `${formatRewardRisk(rr)} : 1`}
            </span>
          </div>
          <div className="trainer-order-row">
            <label>
              入场理由
              <input
                className="input"
                type="text"
                value={entryReason}
                onChange={(e) => setEntryReason(e.target.value)}
              />
            </label>
          </div>
          <div className="trainer-order-row trainer-size-group">
            <span className="trainer-size-label">入场{DIRECTION_LABEL[draft.direction]}</span>
            {SIZE_PRESETS.map(({ label, size }) => (
              <button
                key={label}
                className="btn btn--accent"
                aria-label={`入场${DIRECTION_LABEL[draft.direction]} ${label}`}
                disabled={submitting || !rrOk}
                onClick={() => void submit(size)}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
      {error && <div className="trainer-order-error">{error}</div>}
    </div>
  );
}

interface TrainerPositionPanelProps {
  position: TrainerPosition;
  amendDraft: AmendDraft;
  verdict: AmendVerdict | null;
  amendReason: string;
  onAmendReasonChange: (value: string) => void;
  onStopChange: (price: number) => void;
  onTargetChange: (price: number) => void;
  onConfirmAmend: () => void;
  addReason: string;
  onAddReasonChange: (value: string) => void;
  onAdd: (size: number) => void;
  exitReason: string;
  onExitReasonChange: (value: string) => void;
  onReduce: (size: number | null) => void;
  submitting: boolean;
  error: string | null;
}

function TrainerPositionPanel({
  position,
  amendDraft,
  verdict,
  amendReason,
  onAmendReasonChange,
  onStopChange,
  onTargetChange,
  onConfirmAmend,
  addReason,
  onAddReasonChange,
  onAdd,
  exitReason,
  onExitReasonChange,
  onReduce,
  submitting,
  error,
}: TrainerPositionPanelProps) {
  const amendLocked = submitting || !verdict?.allowed;
  const held = openPositionSize(position);
  const headroom = addToFullSize(position);

  const summary = `持仓中：${position.direction === 'long' ? '多头' : '空头'} · 仓位 ${formatPositionSize(held)} @${fmt(position.entryPrice)} 止损 ${fmt(position.stop)} 目标 ${fmt(position.target)}`;

  return (
    <div className="trainer-order-panel">
      <div className="trainer-order-row trainer-order-panel--status">{summary}</div>
      <div className="trainer-order-row">
        <label>
          止损
          <input
            className="input"
            type="number"
            step="0.01"
            value={amendDraft.stop}
            onChange={(e) => {
              const value = Number(e.target.value);
              if (Number.isFinite(value)) onStopChange(value);
            }}
          />
        </label>
        <label>
          目标
          <input
            className="input"
            type="number"
            step="0.01"
            value={amendDraft.target}
            onChange={(e) => {
              const value = Number(e.target.value);
              if (Number.isFinite(value)) onTargetChange(value);
            }}
          />
        </label>
      </div>
      <div className="trainer-order-row">
        <label>
          调整原因
          <input
            className="input"
            type="text"
            value={amendReason}
            onChange={(e) => onAmendReasonChange(e.target.value)}
          />
        </label>
      </div>
      <div className="trainer-order-row">
        <button className="btn btn--accent" disabled={amendLocked} onClick={onConfirmAmend}>
          确认调整
        </button>
        {verdict === null && <span className="trainer-order-guard">校验中…</span>}
        {verdict && !verdict.allowed && (
          <span className="trainer-order-guard trainer-order-guard--blocked" role="status">
            {verdict.error ?? '这笔调整不被允许'}
          </span>
        )}
      </div>
      <div className="trainer-order-row">
        <label>
          加仓理由
          <input
            className="input"
            type="text"
            value={addReason}
            onChange={(e) => onAddReasonChange(e.target.value)}
          />
        </label>
      </div>
      <div className="trainer-order-row trainer-size-group">
        <span className="trainer-size-label">加仓</span>
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
      <div className="trainer-order-row">
        <label>
          平仓原因
          <input
            className="input"
            type="text"
            value={exitReason}
            onChange={(e) => onExitReasonChange(e.target.value)}
          />
        </label>
      </div>
      <div className="trainer-order-row trainer-size-group">
        <span className="trainer-size-label">平仓</span>
        {SIZE_PRESETS.map(({ label, size }) => {
          // 全仓 sends an unsized reduce — "close whatever is left" — so it stays available on a
          // part-filled holding that a literal 1.0 fraction would exceed.
          const closesEverything = size === FULL_POSITION;
          return (
            <button
              key={label}
              className="btn"
              aria-label={`平仓 ${label}`}
              disabled={submitting || (!closesEverything && !canReduceSize(position, size))}
              onClick={() => onReduce(closesEverything ? null : size)}
            >
              {label}
            </button>
          );
        })}
      </div>
      {error && <div className="trainer-order-error">{error}</div>}
    </div>
  );
}

interface TrainerPendingOrderPanelProps {
  order: TrainerOrder;
  reason: string;
  onReasonChange: (value: string) => void;
  onConfirm: () => void;
  submitting: boolean;
  error: string | null;
}

function TrainerPendingOrderPanel({
  order,
  reason,
  onReasonChange,
  onConfirm,
  submitting,
  error,
}: TrainerPendingOrderPanelProps) {
  const summary = `挂单中：${order.direction === 'long' ? '多头' : '空头'} @${order.entry} 止损 ${order.stop} 目标 ${order.target}`;

  return (
    <div className="trainer-order-panel">
      <div className="trainer-order-row trainer-order-panel--status">{summary}</div>
      <div className="trainer-order-row">
        <label>
          撤单原因
          <input
            className="input"
            type="text"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
          />
        </label>
      </div>
      <div className="trainer-order-row">
        <button className="btn" disabled={submitting} onClick={onConfirm}>
          撤销挂单
        </button>
      </div>
      {error && <div className="trainer-order-error">{error}</div>}
    </div>
  );
}
