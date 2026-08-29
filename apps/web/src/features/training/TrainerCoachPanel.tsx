import { useState } from 'react';
import type { TrainerCoachCall } from '@kansoku/pro-api';
import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes, fonts, radii } from '../../theme/tokens.stylex';
import type { TrainerBridge } from '../desktop/desktopTrainerBridge';
import { coachDisagrees, coachPlanLine, DIRECTION_LABEL } from './coachStance';
import { TrainerOverlayPortal } from './trainerOverlay';

const styles = stylex.create({
  chip: {
    alignItems: 'center',
    backgroundColor: 'rgb(20 20 20 / 0.88)',
    borderColor: colors.borderStrong,
    borderRadius: radii.default,
    borderStyle: 'solid',
    borderWidth: '1px',
    color: colors.textPrimary,
    display: 'flex',
    fontSize: fontSizes.sm,
    fontVariantNumeric: 'tabular-nums',
    gap: '8px',
    padding: '3px 9px',
    pointerEvents: 'auto',
  },
  chipError: {
    borderLeftColor: colors.down,
    borderLeftStyle: 'solid',
    borderLeftWidth: '2px',
    color: colors.down,
  },
  slot: {
    alignItems: 'center',
    display: 'flex',
    flex: '0 0 auto',
    padding: '0 12px 0 4px',
  },
  coach: {
    alignItems: 'stretch',
    borderLeft: `2px solid ${colors.accent}`,
    cursor: 'pointer',
    flexDirection: 'column',
    fontFamily: fonts.ui,
    fontSize: fontSizes.sm,
    gap: '6px',
    maxWidth: '320px',
    textAlign: 'left',
  },
  stance: {
    alignItems: 'center',
    display: 'flex',
    gap: '8px',
  },
  caret: {
    color: colors.textMuted,
    marginLeft: 'auto',
  },
  comment: {
    borderTop: `1px solid ${colors.border}`,
    color: colors.textSecondary,
    display: 'block',
    lineHeight: 1.6,
    paddingTop: '6px',
  },
  defer: {
    color: colors.textMuted,
    display: 'block',
    fontSize: fontSizes.xs,
    marginTop: '6px',
  },
  split: {
    color: colors.accent,
  },
});

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
        {error && (
          <div
            className={`trainer-chip trainer-chip--error ${stylex.props(styles.chip, styles.chipError).className}`}
          >
            {error}
          </div>
        )}
        {latest && (
          // Collapsed by default: the side and the three prices are what gets read at a glance,
          // the reasoning is what gets read on purpose. Expanding by default would drop a
          // paragraph over the newest candles, which is where the trader is looking.
          <button
            type="button"
            className={`trainer-chip trainer-chip--coach ${stylex.props(styles.coach).className}${open ? ' is-open' : ''}`}
            data-testid="trainer-coach-latest"
            aria-expanded={open}
            onClick={() => setOpen((prev) => !prev)}
          >
            <span className={`trainer-coach-stance ${stylex.props(styles.stance).className}`}>
              <b>AI</b>
              <span>{DIRECTION_LABEL[latest.ai.direction]}</span>
              {plan?.prices && <span className="num">{plan.prices}</span>}
              {coachDisagrees(latest) && (
                <span className={`trainer-coach-split ${stylex.props(styles.split).className}`}>
                  与你分歧
                </span>
              )}
              <span className={`trainer-coach-caret ${stylex.props(styles.caret).className}`}>
                {open ? '⌃' : '⌄'}
              </span>
            </span>
            {open && (
              <span
                className={`trainer-coach-comment ${stylex.props(styles.comment).className}`}
                data-testid="trainer-coach-comment"
              >
                {latest.ai.comment}
                <span className={`trainer-coach-defer ${stylex.props(styles.defer).className}`}>
                  对错与理由的评判留到收盘后
                </span>
              </span>
            )}
          </button>
        )}
      </TrainerOverlayPortal>
      <div className={`trainer-coach-slot ${stylex.props(styles.slot).className}`}>
        <button className="btn trainer-coach-ask" disabled={asking} onClick={() => void ask()}>
          {asking ? '问 AI…' : calls.length === 0 ? '问 AI' : `问 AI · ${calls.length}`}
        </button>
      </div>
    </>
  );
}
