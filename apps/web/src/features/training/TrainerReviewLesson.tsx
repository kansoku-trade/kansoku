import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { TrainerLesson } from '@kansoku/pro-api';
import type { TrainerBridge } from '../desktop/desktopTrainerBridge';
import { colors, fontSizes, radii, sizes } from '../../theme/tokens.stylex';

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '8px',
  },
  input: {
    flex: '1 1 260px',
    minWidth: 0,
    height: sizes.controlHeight,
    boxSizing: 'border-box',
    padding: '0 10px',
    backgroundColor: colors.backgroundElement,
    borderColor: colors.borderStrong,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: radii.default,
    color: colors.textPrimary,
    fontFamily: 'inherit',
    fontSize: 'inherit',
    fontStyle: 'inherit',
    fontWeight: 'inherit',
    lineHeight: 'inherit',
  },
  label: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    letterSpacing: '0.09em',
    textTransform: 'uppercase',
  },
  button: {
    'alignItems': 'center',
    'backgroundColor': colors.backgroundElement,
    'borderColor': colors.borderStrong,
    'borderRadius': radii.default,
    'borderStyle': 'solid',
    'borderWidth': '1px',
    'boxSizing': 'border-box',
    'color': colors.textPrimary,
    'cursor': 'pointer',
    'display': 'inline-flex',
    'fontSize': fontSizes.base,
    'gap': '7px',
    'height': sizes.controlHeight,
    'padding': '0 14px',
    ':hover:not(:disabled)': {
      borderColor: colors.accent,
    },
    ':focus-visible': {
      borderColor: colors.focusBorder,
      boxShadow: colors.focusRing,
      outline: 'none',
    },
  },
  accent: {
    borderColor: colors.accent,
    color: colors.accent,
  },
  disabled: {
    borderColor: colors.borderStrong,
    color: colors.textMuted,
    cursor: 'default',
  },
  error: {
    color: colors.down,
    fontSize: fontSizes.sm,
  },
  hint: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
  },
});

export interface TrainerReviewLessonProps {
  lesson: TrainerLesson | null;
  bridge: TrainerBridge;
  sessionId: string;
  onChange: (lesson: TrainerLesson) => void;
}

/**
 * Two buttons, and the second one is the only route out of the training area.
 *
 * `journal/lessons.md` is read before every short-term call. A training board is synthetic — prices
 * scaled, symbol false, no news — so part of what it teaches is about the trader's own habits and
 * belongs there, while the rest is about the case pool and would be pollution. Nothing can tell
 * those apart automatically, so the release stays a deliberate press.
 */
export function TrainerReviewLesson({
  lesson,
  bridge,
  sessionId,
  onChange,
}: TrainerReviewLessonProps) {
  const [text, setText] = useState(lesson?.text ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saved = lesson !== null && lesson.text === text.trim();

  const run = async (action: () => ReturnType<TrainerBridge['saveLesson']>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (result.ok) onChange(result.data);
      else setError(result.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`trainer-review-lesson ${stylex.props(styles.root).className}`}
      data-testid="trainer-review-lesson"
    >
      <div className={`trainer-label ${stylex.props(styles.label).className}`}>教训</div>
      <div className={`trainer-review-lesson-row ${stylex.props(styles.row).className}`}>
        <input
          className={`trainer-lesson-input ${stylex.props(styles.input).className}`}
          value={text}
          placeholder="一句话，写你自己的毛病"
          aria-label="本局教训"
          onChange={(e) => setText(e.target.value)}
        />
        <button
          className={`btn ${stylex.props(styles.button, (busy || text.trim().length === 0) && styles.disabled).className}`}
          disabled={busy || text.trim().length === 0}
          onClick={() => void run(() => bridge.saveLesson({ sessionId, text }))}
        >
          存进训练区
        </button>
        <button
          className={`btn btn--accent ${stylex.props(styles.button, styles.accent, (busy || !saved || lesson?.syncedAt !== null) && styles.disabled).className}`}
          disabled={busy || !saved || lesson?.syncedAt !== null}
          title={saved ? undefined : '先存进训练区'}
          onClick={() => void run(() => bridge.syncLesson({ sessionId }))}
        >
          {lesson?.syncedAt ? '已同步到 lessons.md' : '同步到 journal/lessons.md'}
        </button>
      </div>
      {error && (
        <span className={`trainer-order-error ${stylex.props(styles.error).className}`}>
          {error}
        </span>
      )}
      <p className={`trainer-settle-hint ${stylex.props(styles.hint).className}`}>
        默认只存训练区。写的是你自己的操作习惯就值得放行；写的是「这个案例池假突破特别多」就别同步
        —— 合成盘的特征灌进实盘必读清单是污染。
      </p>
    </div>
  );
}
