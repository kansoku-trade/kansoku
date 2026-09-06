import { type ReactNode } from 'react';
import { clsx } from 'clsx';
import { useConversationFold } from './conversationFold.js';
import * as stylex from '@stylexjs/stylex';
import { Fold } from '@web/ui';
import { formatWorkedDuration } from './presentTranscript.js';
import { turnHeaderStyles } from './TurnHeader.js';

const styles = stylex.create({
  fold: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    paddingTop: '8px',
    paddingBottom: '2px',
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
        className={clsx(
          'chat-worked-btn',
          stylex.props(turnHeaderStyles.row, turnHeaderStyles.interactive).className,
        )}
        aria-label={label}
      >
        <span>{label}</span>
        <span className={stylex.props(turnHeaderStyles.rule).className} aria-hidden="true" />
      </Fold.Trigger>
      <Fold.Panel className={clsx('chat-worked-fold', stylex.props(styles.fold).className)}>
        {children}
      </Fold.Panel>
    </Fold>
  );
}
