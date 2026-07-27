import { useEffect, useRef, useState } from 'react';
import type {
  TrainerReason,
  TrainerStepEvent,
  TrainerView,
  TrainerViewPeriod,
} from '@kansoku/pro-api';
import type { TrainerBridge } from '../desktop/desktopTrainerBridge';
import {
  describeStepEvents,
  PLAYBACK_SPEEDS,
  playbackIntervalMs,
  type PlaybackSpeed,
} from './advanceStep';
import { reasonOrNotGiven } from './orderDraft';

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

  return (
    <div className="trainer-advance-controls">
      <div className="trainer-advance-row">
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
        <div className="trainer-advance-speed">
          {PLAYBACK_SPEEDS.map((s) => (
            <button key={s} className="btn" aria-pressed={speed === s} onClick={() => setSpeed(s)}>
              {s}x
            </button>
          ))}
        </div>
      </div>
      {needsReason && (
        <div className="trainer-advance-row">
          <label>
            继续持有理由
            <input
              className="input"
              type="text"
              value={holdReason}
              onChange={(e) => setHoldReason(e.target.value)}
            />
          </label>
          {reasonReused && <span className="trainer-advance-reason-reused">沿用上一次理由</span>}
        </div>
      )}
      {narrative && <div className="trainer-advance-events">{narrative}</div>}
      {error && <div className="trainer-order-error">{error}</div>}
    </div>
  );
}
