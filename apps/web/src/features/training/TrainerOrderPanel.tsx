import { useEffect, useRef, useState } from 'react';
import type {
  TrainerEntryMode,
  TrainerPosition,
  TrainerReason,
  TrainerView,
} from '@kansoku/pro-api';
import { PositionBoxPrimitive } from '../charts/intraday/positionBoxPrimitive';
import type { DrawingChartHandle } from '../charts/intraday/useIntradayCharts';
import type { TrainerBridge } from '../desktop/desktopTrainerBridge';
import { clampAmendStop, clampAmendTarget, widensStop, type AmendDraft } from './amendDraft';
import {
  buildOrderSubmission,
  clampStop,
  clampTarget,
  defaultOrderDraft,
  lastClose,
  meetsRewardRiskFloor,
  rewardRiskRatio,
  withDirection,
  type OrderDraft,
} from './orderDraft';
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<PositionBoxPrimitive | null>(null);
  const flat = view.phase === 'flat';
  const position = view.position;

  // Reset (or seed) the amend draft during render rather than in a useEffect, so a fresh
  // position's stop/target reach the input fields and the drag box on the very same commit —
  // an effect-based reset would land a frame after paint, flashing the plain status line first.
  const [amendDraft, setAmendDraft] = useState<AmendDraft | null>(null);
  const [amendDraftTradeId, setAmendDraftTradeId] = useState<number | null>(null);
  const [amendReason, setAmendReason] = useState('');
  if (position && position.tradeId !== amendDraftTradeId) {
    setAmendDraftTradeId(position.tradeId);
    setAmendDraft({ stop: position.stop, target: position.target });
    setAmendReason('');
  } else if (!position && amendDraftTradeId !== null) {
    setAmendDraftTradeId(null);
    setAmendDraft(null);
  }

  useEffect(() => {
    if (!handle) return;
    const box = new PositionBoxPrimitive();
    handle.series.attachPrimitive(box);
    boxRef.current = box;
    return () => {
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

  const updateAmendStop = (price: number) => {
    if (!position) return;
    const reference = lastClose(view);
    setAmendDraft((prev) => ({
      stop: clampAmendStop(position.direction, reference, position.stop, price),
      target: prev?.target ?? position.target,
    }));
  };

  const updateAmendTarget = (price: number) => {
    if (!position) return;
    const reference = lastClose(view);
    setAmendDraft((prev) => ({
      stop: prev?.stop ?? position.stop,
      target: clampAmendTarget(position.direction, reference, price),
    }));
  };

  useOrderBoxDrag(
    boxActive ? handle : null,
    { stop: boxStop, target1: boxTarget },
    {
      onStopDrag: flat ? (price) => updateDraft({ stop: price }) : updateAmendStop,
      onTargetDrag: flat ? (price) => updateDraft({ target1: price }) : updateAmendTarget,
    },
  );

  const confirmAmend = async () => {
    if (!position || !amendDraft) return;
    setSubmitting(true);
    setError(null);
    const reason: TrainerReason = { category: 'risk_management', summary: amendReason.trim() };
    const result = await bridge.amend({
      sessionId,
      stop: amendDraft.stop,
      target: amendDraft.target,
      reason,
    });
    setSubmitting(false);
    if (result.ok) {
      onViewChange(result.data.view);
      return;
    }
    setError(result.error);
    if (result.view) onViewChange(result.view);
  };

  if (!flat) {
    if (position && amendDraft) {
      return (
        <TrainerPositionPanel
          position={position}
          amendDraft={amendDraft}
          reason={amendReason}
          onReasonChange={setAmendReason}
          onStopChange={updateAmendStop}
          onTargetChange={updateAmendTarget}
          onConfirm={confirmAmend}
          submitting={submitting}
          error={error}
        />
      );
    }
    const order = view.order;
    const summary = order
      ? `挂单中：${order.direction === 'long' ? '多头' : '空头'} @${order.entry} 止损 ${order.stop} 目标 ${order.target}`
      : '本局已结束';
    return <div className="trainer-order-panel trainer-order-panel--status">{summary}</div>;
  }

  const rr = rewardRiskRatio(draft);
  const rrOk = meetsRewardRiskFloor(draft);

  const handleNumberChange =
    (field: 'entry' | 'stop' | 'target1') => (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = Number(e.target.value);
      if (Number.isFinite(value)) updateDraft({ [field]: value });
    };

  const submit = async (entryMode: TrainerEntryMode) => {
    setSubmitting(true);
    setError(null);
    const submission = buildOrderSubmission(view, draft, entryMode);
    const result = await bridge.submit({ sessionId, submission, entryMode });
    setSubmitting(false);
    if (result.ok) {
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
          盈亏比 {rr === null ? '—' : `${rr.toFixed(2)} : 1`}
        </span>
      </div>
      <div className="trainer-order-row">
        <button
          className="btn btn--accent"
          disabled={submitting || !rrOk}
          onClick={() => submit('limit')}
        >
          提交限价单
        </button>
        <button className="btn" disabled={submitting || !rrOk} onClick={() => submit('market')}>
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
  reason: string;
  onReasonChange: (value: string) => void;
  onStopChange: (price: number) => void;
  onTargetChange: (price: number) => void;
  onConfirm: () => void;
  submitting: boolean;
  error: string | null;
}

function TrainerPositionPanel({
  position,
  amendDraft,
  reason,
  onReasonChange,
  onStopChange,
  onTargetChange,
  onConfirm,
  submitting,
  error,
}: TrainerPositionPanelProps) {
  const locked =
    submitting ||
    reason.trim().length === 0 ||
    widensStop(position.direction, position.stop, amendDraft.stop);

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
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
          />
        </label>
      </div>
      <div className="trainer-order-row">
        <button className="btn btn--accent" disabled={locked} onClick={onConfirm}>
          确认调整
        </button>
      </div>
      {error && <div className="trainer-order-error">{error}</div>}
    </div>
  );
}
