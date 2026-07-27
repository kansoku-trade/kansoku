import { useEffect, useRef, useState } from 'react';
import type {
  TrainerEntryMode,
  TrainerEnvelope,
  TrainerOrder,
  TrainerPosition,
  TrainerStepResult,
  TrainerView,
} from '@kansoku/pro-api';
import { PositionBoxPrimitive } from '../charts/intraday/positionBoxPrimitive';
import type { DrawingChartHandle } from '../charts/intraday/useIntradayCharts';
import type { TrainerBridge } from '../desktop/desktopTrainerBridge';
import {
  buildOrderSubmission,
  clampStop,
  clampTarget,
  defaultOrderDraft,
  formatRewardRisk,
  lastClose,
  meetsRewardRiskFloor,
  rewardRiskRatio,
  withDirection,
  type AmendDraft,
  type OrderDraft,
} from './orderDraft';
import { freshVerdict, useAmendCheck, type AmendVerdict } from './useAmendCheck';
import { useOrderBoxDrag } from './useOrderBoxDrag';

const BOX_SPAN_SEC = 100 * 24 * 3600;

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
}

export function TrainerOrderPanel({
  view,
  handle,
  bridge,
  sessionId,
  onViewChange,
}: TrainerOrderPanelProps) {
  const [draft, setDraft] = useState<OrderDraft>(() => defaultOrderDraft(view));
  const [entryReason, setEntryReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<PositionBoxPrimitive | null>(null);
  const flat = view.phase === 'flat';
  const position = view.position;
  const order = view.order;

  // Reset (or seed) the amend draft during render rather than in a useEffect, so a fresh
  // position's stop/target reach the input fields and the drag box on the very same commit —
  // an effect-based reset would land a frame after paint, flashing the plain status line first.
  const [amendDraft, setAmendDraft] = useState<AmendDraft | null>(null);
  const [settledAmend, setSettledAmend] = useState<AmendDraft | null>(null);
  const [amendDraftTradeId, setAmendDraftTradeId] = useState<number | null>(null);
  const [amendReason, setAmendReason] = useState('');
  const [exitReason, setExitReason] = useState('');
  if (position && position.tradeId !== amendDraftTradeId) {
    setAmendDraftTradeId(position.tradeId);
    setAmendDraft({ stop: position.stop, target: position.target });
    setSettledAmend({ stop: position.stop, target: position.target });
    setAmendReason('');
    setExitReason('');
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

  const boxActive = flat || (position != null && amendDraft != null);
  const boxEntry = flat ? draft.entry : (position?.entryPrice ?? 0);
  const boxStop = flat ? draft.stop : (amendDraft?.stop ?? 0);
  const boxTarget = flat ? draft.target1 : (amendDraft?.target ?? 0);

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

  const updateDraft = (patch: Partial<Pick<OrderDraft, 'entry' | 'stop' | 'target1'>>) => {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      return {
        ...next,
        stop: clampStop(next.direction, next.entry, next.stop),
        target1: clampTarget(next.direction, next.entry, next.target1),
      };
    });
  };

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

  useOrderBoxDrag(
    boxActive ? handle : null,
    { stop: boxStop, target1: boxTarget },
    {
      onStopDrag: flat
        ? (price) => updateDraft({ stop: price })
        : (price) => applyAmend({ stop: price }, false),
      onTargetDrag: flat
        ? (price) => updateDraft({ target1: price })
        : (price) => applyAmend({ target: price }, false),
      onDragEnd: flat ? undefined : () => setSettledAmend(amendDraftRef.current),
    },
  );

  const checked = useAmendCheck(bridge, sessionId, view.cursor, settledAmend);
  const verdict = freshVerdict(checked, amendDraft, view.cursor);

  const runAction = async (call: () => Promise<TrainerEnvelope<TrainerStepResult>>) => {
    setSubmitting(true);
    setError(null);
    const result = await call();
    setSubmitting(false);
    if (result.ok) {
      onViewChange(result.data.view);
      return;
    }
    setError(result.error);
    if (result.view) onViewChange(result.view);
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

  const confirmExitNextOpen = () => {
    if (!position) return;
    void runAction(() =>
      bridge.exitNextOpen({
        sessionId,
        reason: { category: 'thesis_invalidated', summary: exitReason.trim() },
      }),
    );
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
          exitReason={exitReason}
          onExitReasonChange={setExitReason}
          onExitNextOpen={confirmExitNextOpen}
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

  const rr = rewardRiskRatio(draft);
  const rrOk = meetsRewardRiskFloor(draft);
  const entryReasonOk = entryReason.trim().length > 0;

  const handleNumberChange =
    (field: 'entry' | 'stop' | 'target1') => (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = Number(e.target.value);
      if (Number.isFinite(value)) updateDraft({ [field]: value });
    };

  const submit = async (entryMode: TrainerEntryMode) => {
    setSubmitting(true);
    setError(null);
    const submission = buildOrderSubmission(view, draft, entryMode, entryReason);
    const result = await bridge.submit({ sessionId, submission, entryMode });
    setSubmitting(false);
    if (result.ok) {
      setEntryReason('');
      onViewChange(result.data.view);
      return;
    }
    setError(result.error);
    if (result.view) onViewChange(result.view);
  };

  return (
    <div className="trainer-order-panel">
      <div className="trainer-order-row trainer-direction-toggle">
        <button
          className="btn"
          aria-pressed={draft.direction === 'long'}
          onClick={() => setDraft((prev) => withDirection(prev, 'long'))}
        >
          多
        </button>
        <button
          className="btn"
          aria-pressed={draft.direction === 'short'}
          onClick={() => setDraft((prev) => withDirection(prev, 'short'))}
        >
          空
        </button>
      </div>
      <div className="trainer-order-row">
        <label>
          入场
          <input
            className="input"
            type="number"
            step="0.01"
            value={draft.entry}
            onChange={handleNumberChange('entry')}
          />
        </label>
        <label>
          止损
          <input
            className="input"
            type="number"
            step="0.01"
            value={draft.stop}
            onChange={handleNumberChange('stop')}
          />
        </label>
        <label className={rrOk ? undefined : 'trainer-order-field--warn'}>
          目标
          <input
            className="input"
            type="number"
            step="0.01"
            value={draft.target1}
            onChange={handleNumberChange('target1')}
          />
        </label>
      </div>
      <div className="trainer-order-row">
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
      <div className="trainer-order-row">
        <button
          className="btn btn--accent"
          disabled={submitting || !rrOk || !entryReasonOk}
          onClick={() => submit('limit')}
        >
          提交限价单
        </button>
        <button
          className="btn"
          disabled={submitting || !rrOk || !entryReasonOk}
          onClick={() => submit('market')}
        >
          照现价立刻进
        </button>
      </div>
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
  exitReason: string;
  onExitReasonChange: (value: string) => void;
  onExitNextOpen: () => void;
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
  exitReason,
  onExitReasonChange,
  onExitNextOpen,
  submitting,
  error,
}: TrainerPositionPanelProps) {
  const amendLocked = submitting || amendReason.trim().length === 0 || !verdict?.allowed;
  const exitLocked = submitting || exitReason.trim().length === 0;

  const summary = `持仓中：${position.direction === 'long' ? '多头' : '空头'} @${position.entryPrice} 止损 ${position.stop} 目标 ${position.target}`;

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
          平仓原因
          <input
            className="input"
            type="text"
            value={exitReason}
            onChange={(e) => onExitReasonChange(e.target.value)}
          />
        </label>
      </div>
      <div className="trainer-order-row">
        <button className="btn" disabled={exitLocked} onClick={onExitNextOpen}>
          下一根开盘平仓
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
