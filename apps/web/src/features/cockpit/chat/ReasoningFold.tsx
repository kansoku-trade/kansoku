import { useConversationFold } from './conversationFold.js';
import { Brain } from 'lucide-react';
import { clsx } from 'clsx';
import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes, radii } from '../../../theme/tokens.stylex';
import { Fold } from '@web/ui';
import { Markdown } from '../markdown';

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  button: {
    'gap': '6px',
    'padding': '3px 8px 3px 9px',
    'backgroundColor': colors.backgroundElement,
    'borderColor': colors.border,
    'borderStyle': 'solid',
    'borderWidth': '1px',
    'borderRadius': radii.full,
    'color': colors.textSecondary,
    'cursor': 'pointer',
    'fontSize': fontSizes.base,
    ':hover': {
      color: colors.textPrimary,
      borderColor: colors.borderStrong,
    },
  },
  body: {
    margin: '2px 0',
    overflow: 'hidden',
    padding: '8px 12px',
    backgroundColor: colors.backgroundSurface,
    borderRadius: radii.lg,
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
  plain: {
    display: 'inline-flex',
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
    gap: '8px',
    maxWidth: '100%',
    minHeight: '22px',
    padding: '2px 6px',
  },
  mark: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: '14px',
    height: '14px',
    marginTop: '2px',
    color: colors.textMuted,
  },
  plainBody: {
    minWidth: 0,
    maxWidth: '100%',
  },
});

export function ReasoningFold({
  foldId,
  text,
  streaming,
}: {
  foldId: string;
  text: string;
  streaming?: boolean;
}) {
  if (!text) return null;
  if (!streaming) {
    return (
      <div className={clsx('chat-reasoning', stylex.props(styles.plain).className)}>
        <span className={stylex.props(styles.mark).className} aria-hidden="true">
          <Brain size={11} strokeWidth={2.2} />
        </span>
        <div className={stylex.props(styles.plainBody).className}>
          <Markdown variant="chat" muted>
            {text}
          </Markdown>
        </div>
      </div>
    );
  }
  return <LiveReasoning foldId={foldId} text={text} />;
}

function LiveReasoning({ foldId, text }: { foldId: string; text: string }) {
  const [open, setOpen] = useConversationFold(foldId, true);

  return (
    <Fold
      open={open}
      onToggle={() => setOpen()}
      className={clsx('chat-reasoning', stylex.props(styles.root).className)}
    >
      <Fold.Trigger fit className={clsx('chat-reasoning-btn', stylex.props(styles.button).className)}>
        思考中
      </Fold.Trigger>
      <Fold.Panel className={clsx('chat-reasoning-body', stylex.props(styles.body).className)}>
        <Markdown variant="chat" muted>
          {text}
        </Markdown>
      </Fold.Panel>
    </Fold>
  );
}
