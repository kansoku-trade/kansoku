import { useRef, useState } from 'react';
import type {
  TrainerBasePeriod,
  TrainerEnvelope,
  TrainerOrder,
  TrainerStepResult,
  TrainerView,
} from '@kansoku/pro-api';
import { signed } from '@web/lib/format';
import type { DrawingChartHandle } from '../charts/intraday/useIntradayCharts';
import type { TrainerBridge } from '../desktop/desktopTrainerBridge';
import {
  buildOrderSubmission,
  clampStop,
  clampTarget,
  lastClose,
  meetsRewardRiskFloor,
  MIN_REWARD_RISK,
  reasonOrNotGiven,
  type AmendDraft,
} from './orderDraft';
import { describeEntryOutcome } from './advanceStep';
import { levelR } from './episodeReturns';
import { TrainerEntryLane } from './TrainerEntryLane';
import { TrainerOrderLevels } from './TrainerOrderLevels';
import { TrainerNote } from './TrainerNote';
import { TrainerOverlayPortal } from './trainerOverlay';
import { TrainerPositionLane } from './TrainerPositionLane';
import { freshVerdict, useAmendCheck } from './useAmendCheck';
import { useChartScrollLock } from './useChartScrollLock';
import { useEntryDraft, type EntryDraftApi } from './useEntryDraft';
import { useOrderBoxDrag } from './useOrderBoxDrag';

// Why the entry buttons on the ticket are locked, said in the tooltip rather than left to the
// trader to work out from a greyed-out row.
function entryBlockedReason(entry: EntryDraftApi): string | undefined {
  if (entry.placement.stop === null && entry.placement.target === null)
    return '先从票上拖出 SL 和 TP';
  if (entry.placement.stop === null) return '先从票上拖出 SL 放止损';
  if (entry.placement.target === null) return '先从票上拖出 TP 放目标';
  if (!entry.draft) return '现价已经越过你放的线，重新放一次';
  if (!meetsRewardRiskFloor(entry.draft)) return `盈亏比低于 ${MIN_REWARD_RISK} 下限`;
  return undefined;
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

export function TrainerOrderPanel({
  view,
  handle,
  bridge,
  sessionId,
  onViewChange,
  drawingActive = false,
  onTakeChart,
}: TrainerOrderPanelProps) {
  const [entryNote, setEntryNote] = useState('');
  const [positionNote, setPositionNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Carries the cursor it describes: the sentence is about one specific bar, so it must not still
  // be sitting on the chart once the trader has stepped past that bar.
  const [outcome, setOutcome] = useState<{ text: string; cursor: number } | null>(null);
  const flat = view.phase === 'flat';
  const position = view.position;
  const order = view.order;
  const entry = useEntryDraft(view, onTakeChart);

  // Reset (or seed) the amend draft during render rather than in a useEffect, so a fresh
  // position's stop/target reach the drag box on the very same commit — an effect-based reset
  // would land a frame after paint, flashing the plain status chip first.
  const [amendDraft, setAmendDraft] = useState<AmendDraft | null>(null);
  const [settledAmend, setSettledAmend] = useState<AmendDraft | null>(null);
  const [amendDraftTradeId, setAmendDraftTradeId] = useState<number | null>(null);
  if (position && position.tradeId !== amendDraftTradeId) {
    setAmendDraftTradeId(position.tradeId);
    setAmendDraft({ stop: position.stop, target: position.target });
    setSettledAmend({ stop: position.stop, target: position.target });
    setPositionNote('');
  } else if (!position && amendDraftTradeId !== null) {
    setAmendDraftTradeId(null);
    setAmendDraft(null);
    setSettledAmend(null);
  }
  const amendDraftRef = useRef<AmendDraft | null>(null);
  amendDraftRef.current = amendDraft;

  const [cancelNote, setCancelNote] = useState('');
  const [cancelNoteOrderId, setCancelNoteOrderId] = useState<number | null>(null);
  if (order && order.tradeId !== cancelNoteOrderId) {
    setCancelNoteOrderId(order.tradeId);
    setCancelNote('');
  } else if (!order && cancelNoteOrderId !== null) {
    setCancelNoteOrderId(null);
  }

  // Only used to tell useOrderBoxDrag where the draggable edges are; the levels themselves are DOM
  // lines with their own ticket (TrainerOrderLevels).
  const dragStop = flat ? (entry.placement.stop ?? entry.entry) : (amendDraft?.stop ?? 0);
  const dragTarget = flat ? (entry.placement.target ?? entry.entry) : (amendDraft?.target ?? 0);

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
  // attached to it: picking a drawing tool detaches the order drag, and pressing any direction
  // button calls onTakeChart to put the drawing tool back to 'off'.
  const orderHandle = drawingActive ? null : handle;
  // Only the drawing tools still take the chart's pan away. Levels are pulled out of the entry
  // ticket and dragged by their own handles, so nothing arms a chart-wide placement gesture and
  // there is no armed state left to hold panning hostage.
  useChartScrollLock(handle, drawingActive);

  const edgeHandle = flat
    ? entry.draft
      ? orderHandle
      : null
    : position != null && amendDraft != null
      ? orderHandle
      : null;
  useOrderBoxDrag(
    edgeHandle,
    { stop: dragStop, target1: dragTarget },
    {
      onStopDrag: flat
        ? (price) => entry.setLevel('stop', price)
        : (price) => applyAmend({ stop: price }, false),
      onTargetDrag: flat
        ? (price) => entry.setLevel('target', price)
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

  // One note per lane rather than one per action, so every position-lane action clears it on
  // success — otherwise words written for an amend would silently ride along on the next add.
  const runPositionAction = async (call: () => Promise<TrainerEnvelope<TrainerStepResult>>) => {
    if (await runAction(call)) setPositionNote('');
  };

  // A market order rests in `pending` until a bar is advanced: the last visible bar has already
  // closed, so the earliest honest fill price is the next bar's open (engine.ts, entryMode
  // 'market'). Advancing that one bar here is what makes 市价 mean "I am in" — leaving it to the
  // trader shows them a resting order they never asked for, labelled 挂单中, with nothing saying a
  // step is what fills it.
  const submit = async (size: number) => {
    if (!entry.draft) return;
    setSubmitting(true);
    setError(null);
    setOutcome(null);
    const submission = buildOrderSubmission(view, entry.draft, entryNote);
    const placed = await bridge.submit({ sessionId, submission, entryMode: 'market', size });
    if (!placed.ok) {
      setSubmitting(false);
      setError(placed.error);
      if (placed.view) onViewChange(placed.view);
      return;
    }
    // basePeriod, not the period the chart is showing: a coarser tier would swallow several bars
    // of the episode to fill one order.
    const filled = await bridge.step({
      sessionId,
      action: {
        type: 'hold',
        bars: 1,
        period: view.basePeriod,
        reason: reasonOrNotGiven('other', entryNote),
      },
    });
    setSubmitting(false);
    setEntryNote('');
    entry.clear();
    if (!filled.ok) {
      setError(filled.error);
      onViewChange(filled.view ?? placed.data.view);
      return;
    }
    setOutcome({
      text: describeEntryOutcome(filled.data.events, view.basePeriod),
      cursor: filled.data.view.cursor,
    });
    onViewChange(filled.data.view);
  };

  const errorChip = (
    <TrainerOverlayPortal slot="stack">
      {outcome?.cursor === view.cursor && (
        <div className="trainer-chip trainer-chip--toast">{outcome.text}</div>
      )}
      {error && <div className="trainer-chip trainer-chip--error">{error}</div>}
    </TrainerOverlayPortal>
  );

  if (!flat) {
    if (position && amendDraft) {
      return (
        <>
          {errorChip}
          <TrainerPositionLane
            view={view}
            position={position}
            amendDraft={amendDraft}
            onLevelDrag={(field, price) => applyAmend({ [field]: price }, false)}
            onLevelDragEnd={() => setSettledAmend(amendDraftRef.current)}
            verdict={verdict}
            handle={handle}
            note={positionNote}
            onNoteChange={setPositionNote}
            submitting={submitting}
            onConfirmAmend={() =>
              void runPositionAction(() =>
                bridge.amend({
                  sessionId,
                  stop: amendDraft.stop,
                  target: amendDraft.target,
                  reason: reasonOrNotGiven('risk_management', positionNote),
                }),
              )
            }
            onRevertAmend={() => applyAmend({ stop: position.stop, target: position.target }, true)}
            onAdd={(size) =>
              void runPositionAction(() =>
                bridge.add({ sessionId, size, reason: reasonOrNotGiven('other', positionNote) }),
              )
            }
            onReduce={(size) =>
              void runPositionAction(() =>
                bridge.reduce({
                  sessionId,
                  ...(size === null ? {} : { size }),
                  reason: reasonOrNotGiven('other', positionNote),
                }),
              )
            }
          />
        </>
      );
    }
    if (order) {
      return (
        <>
          {errorChip}
          <TrainerPendingOrderLane
            order={order}
            basePeriod={view.basePeriod}
            note={cancelNote}
            onNoteChange={setCancelNote}
            submitting={submitting}
            onCancel={() =>
              void runAction(() =>
                bridge.cancel({
                  sessionId,
                  reason: reasonOrNotGiven('thesis_invalidated', cancelNote),
                }),
              )
            }
          />
        </>
      );
    }
    return <div className="trainer-lane trainer-order-panel--status">本局已结束</div>;
  }

  // The stop alone defines the risk unit, so a level can be priced before the target exists.
  const basis =
    entry.direction && entry.placement.stop !== null
      ? { direction: entry.direction, entry: entry.entry, stop: entry.placement.stop }
      : null;
  const rAt = (price: number) => {
    const r = levelR(view, basis, price);
    return r === null ? '—' : `${signed(r, 1)}R`;
  };

  return (
    <>
      {errorChip}
      {entry.direction && (
        // The entry ticket is up the instant a side is picked, carrying the TP / SL pulls the other
        // two levels come out of. Each of those appears only once it has actually been placed, so a
        // half-drawn plan looks half-drawn.
        <TrainerOrderLevels
          handle={handle}
          target={
            entry.placement.target === null
              ? null
              : {
                  price: entry.placement.target,
                  text: rAt(entry.placement.target),
                  draggable: true,
                }
          }
          entry={{
            price: entry.entry,
            badge: entry.direction === 'long' ? '做多' : '做空',
            text: '市价',
            draggable: false,
            pulls: [
              { field: 'target', label: 'TP', set: entry.placement.target !== null },
              { field: 'stop', label: 'SL', set: entry.placement.stop !== null },
            ],
          }}
          stop={
            entry.placement.stop === null
              ? null
              : { price: entry.placement.stop, text: rAt(entry.placement.stop), draggable: true }
          }
          onDrag={(kind, price) => entry.setLevel(kind === 'stop' ? 'stop' : 'target', price)}
          submit={{
            label: `入场${entry.direction === 'long' ? '做多' : '做空'}`,
            disabled: submitting || !entry.draft || !meetsRewardRiskFloor(entry.draft),
            blockedReason: entryBlockedReason(entry),
            onSubmit: (size) => void submit(size),
          }}
          dismiss={{ label: '撤销这个计划', onDismiss: entry.clear }}
        />
      )}
      <TrainerEntryLane entry={entry} note={entryNote} onNoteChange={setEntryNote} />
    </>
  );
}

interface TrainerPendingOrderLaneProps {
  order: TrainerOrder;
  basePeriod: TrainerBasePeriod;
  note: string;
  onNoteChange: (value: string) => void;
  onCancel: () => void;
  submitting: boolean;
}

// Only reachable when the fill advance that follows a market submit fails, so it has to name the
// action that fills the order instead of leaving 挂单中 to imply the order is resting by design.
function TrainerPendingOrderLane({
  order,
  basePeriod,
  note,
  onNoteChange,
  onCancel,
  submitting,
}: TrainerPendingOrderLaneProps) {
  const market = order.entryMode === 'market';
  return (
    <>
      <TrainerOverlayPortal slot="stack">
        <div className="trainer-chip">
          <b className={order.direction === 'long' ? 'trainer-chip-long' : 'trainer-chip-short'}>
            {market ? '未成交' : '挂单中'} · {order.direction === 'long' ? '多头' : '空头'}
          </b>
          <span>@{order.entry}</span>
          <span className="trainer-lane-num--stop">止损 {order.stop}</span>
          <span className="trainer-lane-num--target">目标 {order.target}</span>
        </div>
      </TrainerOverlayPortal>
      <div className="trainer-lane">
        <button className="btn" disabled={submitting} onClick={onCancel}>
          撤销挂单
        </button>
        <span className="trainer-lane-spacer" />
        <span className="trainer-lane-hint">
          {market
            ? `市价单在下一根 ${basePeriod} 的开盘价成交 —— 按「步进」推进一根就会成交`
            : `价格触及 ${order.entry} 才成交`}
        </span>
        <TrainerNote label="备注" value={note} onChange={onNoteChange} hint="撤单理由，可以留空" />
      </div>
    </>
  );
}
