import { useConversationFold } from './conversationFold.js';
import { clsx } from 'clsx';
import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes, radii } from '../../../theme/tokens.stylex';
import { Fold } from '@web/ui';
import type { ChatSource } from './collectSources.js';

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    marginTop: '6px',
  },
  button: {
    'gap': '6px',
    'padding': '2px 0',
    'backgroundColor': 'transparent',
    'borderStyle': 'none',
    'borderWidth': 0,
    'color': colors.textMuted,
    'cursor': 'pointer',
    'fontSize': fontSizes.sm,
    ':hover': {
      color: colors.textSecondary,
    },
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  link: {
    'color': colors.accent,
    'fontSize': fontSizes.sm,
    'overflow': 'hidden',
    'textOverflow': 'ellipsis',
    'whiteSpace': 'nowrap',
    'borderRadius': radii.default,
    ':hover': {
      color: colors.textPrimary,
    },
  },
});

export function SourcesFold({ foldId, sources }: { foldId: string; sources: ChatSource[] }) {
  const [open, setOpen] = useConversationFold(foldId);
  if (sources.length === 0) return null;

  return (
    <Fold
      open={open}
      onToggle={() => setOpen()}
      className={clsx('chat-sources', stylex.props(styles.root).className)}
    >
      <Fold.Trigger fit className={clsx('chat-sources-btn', stylex.props(styles.button).className)}>
        {sources.length} 个来源
      </Fold.Trigger>
      <Fold.Panel className={stylex.props(styles.list).className}>
        {sources.map((source) => (
          <a
            key={source.href}
            href={source.href}
            target="_blank"
            rel="noreferrer"
            className={stylex.props(styles.link).className}
          >
            {source.title}
          </a>
        ))}
      </Fold.Panel>
    </Fold>
  );
}
