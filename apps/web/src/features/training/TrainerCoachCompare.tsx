import { useState } from 'react';
import type {
  TrainerAnnotationVerdict,
  TrainerCoachAgreement,
  TrainerCoachCall,
  TrainerCoachOutcome,
} from '@kansoku/pro-api';
import { fmt, signed } from '@web/lib/format';
import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes, radii } from '../../theme/tokens.stylex';
import type { TrainerBridge } from '../desktop/desktopTrainerBridge';
import { coachBarLabel, coachPlanLine, DIRECTION_LABEL } from './coachStance';

const OUTCOME_LABEL: Record<TrainerCoachOutcome, string> = {
  win: '到目标',
  loss: '被止损',
  timeout_flat: '走完没结果',
  no_fill: '没成交',
  format_violation: '三价填错',
  abstained: '它选择观望',
};

const AGREEMENT_LABEL: Record<TrainerCoachAgreement, string> = {
  aligned: '同向 · 不进对照',
  persuaded: '分歧 · 你改了 → 被说服',
  held: '分歧 · 你没改 → 坚持',
};

const ANNOTATION_LABEL: Record<TrainerAnnotationVerdict, string> = {
  sound: '站得住',
  right_call_wrong_reason: '结论对但理由错',
  unfounded: '不成立',
  skipped: '跳过',
};

const ANNOTATION_ORDER: TrainerAnnotationVerdict[] = [
  'sound',
  'right_call_wrong_reason',
  'unfounded',
  'skipped',
];

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  card: {
    backgroundColor: colors.backgroundSurface,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.default,
    display: 'flex',
    flexDirection: 'column',
    gap: '7px',
    padding: '10px 12px',
  },
  head: {
    alignItems: 'center',
    display: 'flex',
    flexWrap: 'wrap',
    fontSize: fontSizes.sm,
    gap: '10px',
  },
  at: {
    cursor: 'pointer',
    font: 'inherit',
  },
  body: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 1.6,
    margin: 0,
  },
  annotate: {
    alignItems: 'center',
    borderTop: `1px dashed ${colors.border}`,
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    paddingTop: '8px',
  },
  persuaded: {
    borderColor: colors.accent,
    color: colors.accent,
  },
  hit: {
    borderColor: colors.up,
    color: colors.up,
  },
  miss: {
    borderColor: colors.down,
    color: colors.down,
  },
});

export interface TrainerCoachCompareProps {
  calls: readonly TrainerCoachCall[];
  bridge: TrainerBridge;
  sessionId: string;
  onAnnotated: (call: TrainerCoachCall) => void;
  onSeek: (coachId: string) => void;
}

/**
 * Sits directly under the chart: each call happened at a specific bar, and the closer the
 * comparison is to that bar the less work it takes to read the two together.
 */
export function TrainerCoachCompare({
  calls,
  bridge,
  sessionId,
  onAnnotated,
  onSeek,
}: TrainerCoachCompareProps) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const annotate = async (coachId: string, verdict: TrainerAnnotationVerdict): Promise<void> => {
    setPending(coachId);
    setError(null);
    try {
      const result = await bridge.annotate({ sessionId, coachId, verdict });
      if (result.ok) onAnnotated(result.data);
      else setError(result.error);
    } finally {
      setPending(null);
    }
  };

  if (calls.length === 0) {
    return (
      <div
        className={`trainer-review-coach ${stylex.props(styles.root).className}`}
        data-testid="trainer-coach-compare"
      >
        <div className="trainer-label">AI 对照</div>
        <p className="trainer-settle-hint">本局没有问过 AI。</p>
      </div>
    );
  }

  return (
    <div
      className={`trainer-review-coach ${stylex.props(styles.root).className}`}
      data-testid="trainer-coach-compare"
    >
      <div className="trainer-label">AI 对照 · 本局召唤 {calls.length} 次</div>
      {error && <span className="trainer-order-error">{error}</span>}
      {calls.map((call, index) => {
        const plan = coachPlanLine(call);
        const verdict = call.verdict;
        return (
          <article
            className={`trainer-coach-card ${stylex.props(styles.card).className}`}
            key={call.id}
          >
            <header className={`trainer-coach-head ${stylex.props(styles.head).className}`}>
              <button
                className={`trainer-chip trainer-coach-at ${stylex.props(styles.at).className}`}
                onClick={() => onSeek(call.id)}
              >
                第 {index + 1} 次 · {coachBarLabel(call.cursor)}
              </button>
              <span>
                AI：<b>{DIRECTION_LABEL[call.ai.direction]}</b>
                {plan.prices && <span className="num"> {plan.prices}</span>}
              </span>
              <span className="trainer-settle-hint">
                {call.humanBefore
                  ? `你当时：${DIRECTION_LABEL[call.humanBefore.direction]}`
                  : '你当时还没表态'}
              </span>
              {verdict && (
                <>
                  {verdict.agreement && (
                    <span
                      className={`trainer-chip trainer-chip--${verdict.agreement}${verdict.agreement === 'persuaded' ? ` ${stylex.props(styles.persuaded).className}` : ''}`}
                    >
                      {AGREEMENT_LABEL[verdict.agreement]}
                    </span>
                  )}
                  <span
                    className={`trainer-chip trainer-chip--${verdict.directionCorrect ? 'hit' : 'miss'} ${stylex.props(verdict.directionCorrect ? styles.hit : styles.miss).className}`}
                  >
                    {OUTCOME_LABEL[verdict.outcome]}
                    {verdict.realizedR !== null && ` · ${signed(verdict.realizedR)}R`}
                    {verdict.plannedRewardRisk !== null &&
                      ` · 计划 ${fmt(verdict.plannedRewardRisk)}:1`}
                  </span>
                </>
              )}
            </header>
            <p className={`trainer-coach-body ${stylex.props(styles.body).className}`}>
              {call.ai.comment}
            </p>
            {/* Only calls the market confirmed get an annotation row. Asking about a call whose
                direction was already refuted buys nothing and trains clicking through. */}
            {verdict?.directionCorrect ? (
              <div className={`trainer-coach-annotate ${stylex.props(styles.annotate).className}`}>
                <span className="trainer-settle-hint">理由站得住吗？</span>
                {ANNOTATION_ORDER.map((option) => (
                  <button
                    key={option}
                    className={`btn${call.annotation?.verdict === option ? ' btn--accent' : ''}`}
                    disabled={pending === call.id}
                    onClick={() => void annotate(call.id, option)}
                  >
                    {ANNOTATION_LABEL[option]}
                  </button>
                ))}
              </div>
            ) : (
              verdict && (
                <p className="trainer-settle-hint">方向没判对，直接归档，不问理由。</p>
              )
            )}
          </article>
        );
      })}
    </div>
  );
}
