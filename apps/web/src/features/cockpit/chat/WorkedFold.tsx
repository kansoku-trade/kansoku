import { type ReactNode } from 'react';
import { clsx } from 'clsx';
import { useConversationFold } from './conversationFold.js';
import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes, radii } from '../../../theme/tokens.stylex';
import { Fold } from '@web/ui';
import { formatWorkedDuration } from './presentTranscript.js';

const styles = stylex.create({
  button: {
    'gap': '6px',
    'margin': '2px 0',
    'padding': '3px 8px 3px 9px',
    'backgroundColor': colors.backgroundElement,
    'borderColor': colors.border,
    'borderStyle': 'solid',
    'borderWidth': '1px',
    'borderRadius': radii.full,
    'color': colors.textSecondary,
    'cursor': 'pointer',
    'fontSize': fontSizes.base,
    'lineHeight': 1.3,
    'whiteSpace': 'nowrap',
    ':hover': {
      color: colors.textPrimary,
      borderColor: colors.borderStrong,
    },
  },
  fold: {
    display: 'flex',
    flexDirection: 'column',
    margin: '4px 0 2px',
    padding: '4px 8px',
    backgroundColor: colors.backgroundSurface,
    borderRadius: radii.lg,
  },
});

export function WorkedFold({
  id,
  durationMs,
  children,
}: {
  id: string;
  durationMs: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useConversationFold(id);
  const label = formatWorkedDuration(durationMs);

  return (
    <Fold open={open} onToggle={() => setOpen()} className="chat-worked">
      <Fold.Trigger
        fit
        className={clsx('chat-worked-btn', stylex.props(styles.button).className)}
        aria-label={label}
      >
        {label}
      </Fold.Trigger>
      <Fold.Panel className={clsx('chat-worked-fold', stylex.props(styles.fold).className)}>
        {children}
      </Fold.Panel>
    </Fold>
  );
}
