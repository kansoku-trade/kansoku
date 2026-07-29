import { useState } from 'react';
import type { TrainerCoachCall, TrainerView } from '@kansoku/pro-api';
import type { TrainerBridge } from '../desktop/desktopTrainerBridge';
import {
  coachDisagrees,
  coachLockReason,
  coachPlanLine,
  DIRECTION_LABEL,
} from './coachStance';
import { TrainerOverlayPortal } from './trainerOverlay';

export interface TrainerCoachPanelProps {
  view: TrainerView;
  bridge: TrainerBridge;
  sessionId: string;
}

/**
 * The second opinion, on demand and unlimited — the trader pays for each one, so how many to spend
 * is theirs to decide. What is not theirs is the order: the button stays locked until they have
 * submitted (see `coachUnlocked`).
 *
 * Nothing here shows a verdict. Mid-episode there is no outcome to judge against, and putting a
 * provisional one on screen would tell the trader which way the case goes.
 */
export function TrainerCoachPanel({ view, bridge, sessionId }: TrainerCoachPanelProps) {
  const [calls, setCalls] = useState<TrainerCoachCall[]>([]);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = coachLockReason(view);
  const latest = calls.at(-1) ?? null;

  const ask = async (): Promise<void> => {
    setAsking(true);
    setError(null);
    try {
      const result = await bridge.coach({ sessionId });
      if (result.ok) setCalls((prev) => [...prev, result.data]);
      else setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAsking(false);
    }
  };

  return (
    <>
      {latest && (
        <TrainerOverlayPortal slot="stack">
          <div className="trainer-chip trainer-chip--coach" data-testid="trainer-coach-latest">
            <b>AI</b>
            <span>{DIRECTION_LABEL[latest.ai.direction]}</span>
            {coachPlanLine(latest).prices && (
              <span className="num">{coachPlanLine(latest).prices}</span>
            )}
            {coachDisagrees(latest) && <span className="trainer-coach-split">与你分歧</span>}
          </div>
        </TrainerOverlayPortal>
      )}
      <div className="trainer-coach-lane" data-testid="trainer-coach-lane">
        <button
          className="btn trainer-coach-ask"
          disabled={locked !== undefined || asking}
          title={locked}
          onClick={() => void ask()}
        >
          {asking ? '正在问…' : calls.length === 0 ? '问 AI' : `再问一次（第 ${calls.length + 1} 次）`}
        </button>
        {locked && <span className="trainer-settle-hint">{locked}</span>}
        {error && <span className="trainer-order-error">{error}</span>}
        {latest && !error && (
          <p className="trainer-coach-comment" data-testid="trainer-coach-comment">
            {latest.ai.comment}
          </p>
        )}
        {calls.length > 0 && (
          <span className="trainer-settle-hint">对错与理由的评判留到收盘后</span>
        )}
      </div>
    </>
  );
}
