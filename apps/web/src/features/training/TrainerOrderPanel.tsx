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
  buildOrderSubmission,
  canAddSize,
  canReduceSize,
  clampStop,
  clampTarget,
  formatPositionSize,
  formatRewardRisk,
  FULL_POSITION,
  HALF_POSITION,
  lastClose,
  meetsRewardRiskFloor,
  openPositionSize,
  placementDraft,
  QUARTER_POSITION,
  rewardRiskRatio,
  roundPrice,
  type AmendDraft,
  type OrderDraft,
} from './orderDraft';
import { freshVerdict, useAmendCheck, type AmendVerdict } from './useAmendCheck';
import { useOrderBoxDrag } from './useOrderBoxDrag';
import { useOrderPlacementDrag } from './useOrderPlacementDrag';

const BOX_SPAN_SEC = 100 * 24 * 3600;

const ENTRY_SIZES = [
  { label: '全仓', size: FULL_POSITION },
  { label: '1/2', size: HALF_POSITION },
  { label: '1/4', size: QUARTER_POSITION },
];

const ADD_SIZES = [
  { label: '1/2', size: HALF_POSITION },
  { label: '1/4', size: QUARTER_POSITION },
];

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

interface PlacementState {
  direction: TrainerDirection | null;
  stop: number;
  target: number;
}

export interface TrainerOrderPanelProps {
  view: TrainerView;
  handle: DrawingChartHandle | null;
  bridge: TrainerBridge;
  sessionId: string;
  onViewChange: (view: TrainerView) => void;
}

export function TrainerOrderPanel({
  view,
  handle,
  bridge,
  sessionId,
  onViewChange,
}: TrainerOrderPanelProps) {
  const [placing, setPlacing] = useState(false);
  const [placement, setPlacement] = useState<PlacementState | null>(null);
  const [placementHint, setPlacementHint] = useState<string | null>(null);
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
  const resolved = placement ? placementDraft(entry, placement) : null;
  const draft: OrderDraft | null =
    placement && placement.direction && resolved?.direction === placement.direction
      ? resolved
      : null;

  const boxActive = flat ? placing || placement !== null : position != null && amendDraft != null;
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

  useOrderPlacementDrag(flat ? handle : null, placing, {
    onPreview: (stop, target) => {
      setPlacementHint(null);
      // The side is resolved on every frame, not only on release, so the prices and the direction
      // are readable while the drag is still happening — the numbers about to be sent are the ones
      // on screen the whole time.
      setPlacement({
        direction: placementDraft(entry, { stop, target })?.direction ?? null,
        stop,
        target,
      });
    },
    onCommit: (stop, target) => {
      const placed = placementDraft(entry, { stop, target });
      if (!placed) {
        setPlacement(null);
        setPlacementHint(`这一拖没有穿过入场线 ${fmt(entry)}，定不出方向，再拖一次`);
        return;
      }
      setPlacement({
        direction: placed.direction,
        stop: placed.stop,
        target: placed.target1,
      });
      setPlacing(false);
    },
  });

  const moveDraftPrice = (field: 'stop' | 'target', price: number) => {
    setPlacement((prev) => {
      if (!prev?.direction) return prev;
      const rounded = roundPrice(price);
      return field === 'stop'
        ? { ...prev, stop: clampStop(prev.direction, entry, rounded) }
        : { ...prev, target: clampTarget(prev.direction, entry, rounded) };
    });
  };

  const edgeHandle = flat ? (placing || !draft ? null : handle) : boxActive ? handle : null;
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
        reason: { category: 'risk_management', summary: amendReason.trim() },
      }),
    );
  };

  const confirmAdd = async (size: number) => {
    if (!position) return;
    const ok = await runAction(() =>
      bridge.add({
        sessionId,
        size,
        reason: { category: 'other', summary: addReason.trim() },
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
        reason: { category: 'other', summary: exitReason.trim() },
      }),
    );
    if (ok) setExitReason('');
  };

  const confirmCancel = () => {
    if (!order) return;
    void runAction(() =>
      bridge.cancel({
        sessionId,
        reason: { category: 'thesis_invalidated', summary: cancelReason.trim() },
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
  const entryReasonOk = entryReason.trim().length > 0;
  const stalePlacement = placement?.direction != null && draft === null;

  const toolLabel = placing ? '取消' : placement ? '重画' : '下单';
  const toggleTool = () => {
    if (placing) {
      setPlacing(false);
      if (!draft) setPlacement(null);
      return;
    }
    setPlacement(null);
    setPlacementHint(null);
    setPlacing(true);
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
      onViewChange(result.data.view);
      return;
    }
    setError(result.error);
    if (result.view) onViewChange(result.view);
  };

  return (
    <div className="trainer-order-panel">
      <div className="trainer-order-row">
        <button className="btn" aria-pressed={placing} onClick={toggleTool}>
          {toolLabel}
        </button>
        {placing && (
          <span className="trainer-order-hint">
            在图上按住拖动：按下的地方是止损，松手的地方是目标，向上穿过入场线 {fmt(entry)}{' '}
            就是做多，向下就是做空
          </span>
        )}
        {!placing && !draft && !placementHint && (
          <span className="trainer-order-hint">按「下单」再到图上拖一条：先定止损，再定目标</span>
        )}
        {placementHint && (
          <span className="trainer-order-hint trainer-order-field--warn">{placementHint}</span>
        )}
        {stalePlacement && (
          <span className="trainer-order-hint trainer-order-field--warn">
            现价 {fmt(entry)} 已经越过你画的线，按「重画」重新拖一次
          </span>
        )}
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
            <span className="trainer-size-label">
              {draft.direction === 'long' ? '入场做多' : '入场做空'}
            </span>
            {ENTRY_SIZES.map(({ label, size }) => (
              <button
                key={label}
                className="btn btn--accent"
                aria-label={`${draft.direction === 'long' ? '入场做多' : '入场做空'} ${label}`}
                disabled={submitting || !rrOk || !entryReasonOk}
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
  const amendLocked = submitting || amendReason.trim().length === 0 || !verdict?.allowed;
  const addLocked = submitting || addReason.trim().length === 0;
  const exitLocked = submitting || exitReason.trim().length === 0;
  const held = openPositionSize(position);

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
        {ADD_SIZES.map(({ label, size }) => (
          <button
            key={label}
            className="btn"
            aria-label={`加仓 ${label}`}
            disabled={addLocked || !canAddSize(position, size)}
            onClick={() => onAdd(size)}
          >
            {label}
          </button>
        ))}
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
        <button
          className="btn"
          aria-label="平仓 1/2"
          disabled={exitLocked || !canReduceSize(position, HALF_POSITION)}
          onClick={() => onReduce(HALF_POSITION)}
        >
          1/2
        </button>
        <button
          className="btn"
          aria-label="平仓 全部"
          disabled={exitLocked}
          onClick={() => onReduce(null)}
        >
          全部
        </button>
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
  const locked = submitting || reason.trim().length === 0;
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
        <button className="btn" disabled={locked} onClick={onConfirm}>
          撤销挂单
        </button>
      </div>
      {error && <div className="trainer-order-error">{error}</div>}
    </div>
  );
}
