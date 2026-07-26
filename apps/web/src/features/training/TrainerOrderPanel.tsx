import { useEffect, useRef, useState } from 'react';
import type { TrainerEntryMode, TrainerView } from '@kansoku/pro-api';
import { PositionBoxPrimitive } from '../charts/intraday/positionBoxPrimitive';
import type { DrawingChartHandle } from '../charts/intraday/useIntradayCharts';
import type { TrainerBridge } from '../desktop/desktopTrainerBridge';
import {
  buildOrderSubmission,
  clampStop,
  clampTarget,
  defaultOrderDraft,
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

  useEffect(() => {
    if (!handle) return;
    const box = new PositionBoxPrimitive();
    handle.series.attachPrimitive(box);
    boxRef.current = box;
    return () => {
      boxRef.current = null;
    };
  }, [handle]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    if (!flat) {
      box.setData(null);
      return;
    }
    box.setData({
      ...boxTimeRange(view),
      entry: draft.entry,
      stop: draft.stop,
      target1: draft.target1,
      target2: draft.target1,
      dimmed: false,
    });
    // handle is a dependency (unused directly in the body) because the box in boxRef.current is
    // only non-null once the sibling effect above has attached it to that handle — without this,
    // the initial draft never reaches the box: it gets attached, but this effect last ran before
    // boxRef.current existed and has no other reason to run again.
  }, [draft, flat, view, handle]);

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

  useOrderBoxDrag(
    flat ? handle : null,
    { stop: draft.stop, target1: draft.target1 },
    {
      onStopDrag: (price) => updateDraft({ stop: price }),
      onTargetDrag: (price) => updateDraft({ target1: price }),
    },
  );

  if (!flat) {
    const order = view.order;
    const position = view.position;
    const summary = position
      ? `持仓中：${position.direction === 'long' ? '多头' : '空头'} @${position.entryPrice} 止损 ${position.stop} 目标 ${position.target}`
      : order
        ? `挂单中：${order.direction === 'long' ? '多头' : '空头'} @${order.entry} 止损 ${order.stop} 目标 ${order.target}`
        : '本局已结束';
    return <div className="trainer-order-panel trainer-order-panel--status">{summary}</div>;
  }

  const rr = rewardRiskRatio(draft);

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
        <label>
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
        <span className="trainer-order-rr">盈亏比 {rr === null ? '—' : `${rr.toFixed(2)} : 1`}</span>
      </div>
      <div className="trainer-order-row">
        <button className="btn btn--accent" disabled={submitting} onClick={() => submit('limit')}>
          提交限价单
        </button>
        <button className="btn" disabled={submitting} onClick={() => submit('market')}>
          照现价立刻进
        </button>
      </div>
      {error && <div className="trainer-order-error">{error}</div>}
    </div>
  );
}
