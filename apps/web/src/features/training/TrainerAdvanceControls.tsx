import { useEffect, useRef, useState } from 'react';
import type {
  TrainerReason,
  TrainerStepEvent,
  TrainerView,
  TrainerViewPeriod,
} from '@kansoku/pro-api';
import { signed } from '@web/lib/format';
import type { TrainerBridge } from '../desktop/desktopTrainerBridge';
import {
  describeStepEvents,
  PLAYBACK_SPEEDS,
  playbackIntervalMs,
  type PlaybackSpeed,
} from './advanceStep';
import { episodeReturns } from './episodeReturns';
import { reasonOrNotGiven } from './orderDraft';
import { TrainerNote } from './TrainerNote';
import { TrainerOverlayPortal } from './trainerOverlay';

export interface TrainerAdvanceControlsProps {
  view: TrainerView;
  period: TrainerViewPeriod;
  bridge: TrainerBridge;
  sessionId: string;
  onViewChange: (view: TrainerView) => void;
}

interface StepOutcome {
  paused: boolean;
}

// Zero is neither a win nor a loss, so it stays neutral rather than borrowing the green.
function swing(r: number): string {
  if (r > 0) return 'trainer-lane-num--target';
  if (r < 0) return 'trainer-lane-num--stop';
  return 'trainer-chip-dim';
}

export function TrainerAdvanceControls({
  view,
  period,
  bridge,
  sessionId,
  onViewChange,
}: TrainerAdvanceControlsProps) {
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastEvents, setLastEvents] = useState<TrainerStepEvent[]>([]);
  const [holdReason, setHoldReason] = useState('');
  const [holdReasonKey, setHoldReasonKey] = useState<number | null>(null);
  const [lastSentReason, setLastSentReason] = useState<string | null>(null);

  // Resetting during render (rather than in an effect) lands the cleared field on the same
  // commit that shows the new order/position, matching TrainerOrderPanel's amend-draft reset.
  const activeTradeId = view.order?.tradeId ?? view.position?.tradeId ?? null;
  if (activeTradeId !== holdReasonKey) {
    setHoldReasonKey(activeTradeId);
    setHoldReason('');
    setLastSentReason(null);
  }

  const needsReason = view.phase !== 'flat';
  const disabled = busy || view.terminal;
  // True exactly when clicking step/play right now would resend the same words already on
  // record for this trade — the record must not read as a fresh judgment every bar when it is
  // really one thesis carried forward untouched. An empty field is not "reuse": it sends the
  // not-given marker every bar by design.
  const reasonReused =
    needsReason && holdReason.trim().length > 0 && holdReason.trim() === lastSentReason;

  // advanceEpisodeSingle throws if a hold while pending/open carries no reason, and the
  // playback loop below always reads this ref, never component-render-time values — a stale
  // closure here would silently keep sending an outdated reason (or period) after the user
  // edits either mid-playback.
  const latestRef = useRef({ view, period, holdReason, bridge, sessionId, onViewChange, speed });
  latestRef.current = { view, period, holdReason, bridge, sessionId, onViewChange, speed };

  const runStep = async (): Promise<StepOutcome> => {
    const current = latestRef.current;
    const currentNeedsReason = current.view.phase !== 'flat';
    setBusy(true);
    setError(null);
    const reason: TrainerReason | undefined = currentNeedsReason
      ? reasonOrNotGiven('time_horizon', current.holdReason)
      : undefined;
    const result = await current.bridge.step({
      sessionId: current.sessionId,
      action: { type: 'hold', bars: 1, period: current.period, ...(reason ? { reason } : {}) },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      if (result.view) current.onViewChange(result.view);
      return { paused: true };
    }
    current.onViewChange(result.data.view);
    setLastEvents(result.data.events);
    if (reason) setLastSentReason(reason.summary);
    return { paused: result.data.events.length > 0 || result.data.terminal };
  };

  const handleStep = () => {
    if (disabled) return;
    void runStep();
  };

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (disabled) return;
    setPlaying(true);
  };

  useEffect(() => {
    if (!playing) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      const { paused } = await runStep();
      if (cancelled) return;
      if (paused) {
        setPlaying(false);
        return;
      }
      timer = setTimeout(tick, playbackIntervalMs(latestRef.current.speed));
    };

    timer = setTimeout(tick, playbackIntervalMs(latestRef.current.speed));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [playing]);

  const narrative = lastEvents.length > 0 ? describeStepEvents(lastEvents, view.basePeriod) : null;
  const returns = episodeReturns(view);

  return (
    <>
      <TrainerOverlayPortal slot="stack">
        {narrative && <div className="trainer-chip trainer-chip--toast">{narrative}</div>}
        {error && <div className="trainer-chip trainer-chip--error">{error}</div>}
      </TrainerOverlayPortal>
      <div className="trainer-lane">
        <button className="btn" disabled={disabled} onClick={handleStep}>
          步进 · {period}
        </button>
        <button
          className="btn"
          aria-pressed={playing}
          disabled={playing ? false : disabled}
          onClick={togglePlay}
        >
          {playing ? '暂停' : '播放'}
        </button>
        <div className="trainer-lane-sep" />
        <div className="trainer-lane-group">
          {PLAYBACK_SPEEDS.map((s) => (
            <button key={s} className="btn" aria-pressed={speed === s} onClick={() => setSpeed(s)}>
              {s}x
            </button>
          ))}
        </div>
        <span className="trainer-lane-spacer" />
        {returns.tradeR !== null && (
          <span
            className="trainer-lane-num"
            title="本笔：已落袋加上还没平的部分，按 R 计。R 是一份风险，等于首次成交价到初始止损的距离"
          >
            <span className="trainer-lane-label">本笔</span>{' '}
            <b className={swing(returns.tradeR)}>{signed(returns.tradeR)}R</b>
            {returns.tradePct !== null && (
              <span className="trainer-chip-dim"> {signed(returns.tradePct, 2)}%</span>
            )}
          </span>
        )}
        <span className="trainer-lane-num" title="本局：已平仓的每一笔加上现在这笔的浮动盈亏">
          <span className="trainer-lane-label">本局</span>{' '}
          <b className={swing(returns.sessionR)}>{signed(returns.sessionR)}R</b>
        </span>
        <div className="trainer-lane-sep" />
        {reasonReused && <span className="trainer-lane-hint">沿用上一次理由</span>}
        {needsReason && (
          <TrainerNote
            label="持有备注"
            value={holdReason}
            onChange={setHoldReason}
            hint="继续持有的理由，可以留空"
          />
        )}
      </div>
    </>
  );
}
