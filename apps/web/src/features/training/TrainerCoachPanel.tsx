import { useState } from 'react';
import type { TrainerCoachCall } from '@kansoku/pro-api';
import type { TrainerBridge } from '../desktop/desktopTrainerBridge';
import { coachDisagrees, coachPlanLine, DIRECTION_LABEL } from './coachStance';
import { TrainerOverlayPortal } from './trainerOverlay';

export interface TrainerCoachPanelProps {
  bridge: TrainerBridge;
  sessionId: string;
}

/**
 * The second opinion, on demand, unlimited, and reachable from the first bar — the trader pays for
 * each one, so when and how often to spend is theirs to decide.
 *
 * Everything this renders lives either in the order lane or in the absolutely positioned overlay,
 * never in a row of its own: an answer arriving must not resize the chart the trader is reading.
 *
 * Nothing here shows a verdict. Mid-episode there is no outcome to judge against, and putting a
 * provisional one on screen would tell the trader which way the case goes.
 */
export function TrainerCoachPanel({ bridge, sessionId }: TrainerCoachPanelProps) {
  const [calls, setCalls] = useState<TrainerCoachCall[]>([]);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const latest = calls.at(-1) ?? null;

  const ask = async (): Promise<void> => {
    setAsking(true);
    setError(null);
    try {
      const result = await bridge.coach({ sessionId });
      if (result.ok) {
        setCalls((prev) => [...prev, result.data]);
        setOpen(false);
      } else setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAsking(false);
    }
  };

  const plan = latest ? coachPlanLine(latest) : null;

  return (
    <>
      <TrainerOverlayPortal slot="stack">
        {error && <div className="trainer-chip trainer-chip--error">{error}</div>}
        {latest && (
          // Collapsed by default: the side and the three prices are what gets read at a glance,
          // the reasoning is what gets read on purpose. Expanding by default would drop a
          // paragraph over the newest candles, which is where the trader is looking.
          <button
            type="button"
            className={`trainer-chip trainer-chip--coach${open ? ' is-open' : ''}`}
            data-testid="trainer-coach-latest"
            aria-expanded={open}
            onClick={() => setOpen((prev) => !prev)}
          >
            <span className="trainer-coach-stance">
              <b>AI</b>
              <span>{DIRECTION_LABEL[latest.ai.direction]}</span>
              {plan?.prices && <span className="num">{plan.prices}</span>}
              {coachDisagrees(latest) && <span className="trainer-coach-split">与你分歧</span>}
              <span className="trainer-coach-caret">{open ? '⌃' : '⌄'}</span>
            </span>
            {open && (
              <span className="trainer-coach-comment" data-testid="trainer-coach-comment">
                {latest.ai.comment}
                <span className="trainer-coach-defer">对错与理由的评判留到收盘后</span>
              </span>
            )}
          </button>
        )}
      </TrainerOverlayPortal>
      <div className="trainer-coach-slot">
        <button className="btn trainer-coach-ask" disabled={asking} onClick={() => void ask()}>
          {asking ? '问 AI…' : calls.length === 0 ? '问 AI' : `问 AI · ${calls.length}`}
        </button>
      </div>
    </>
  );
}
