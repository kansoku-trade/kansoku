import { useEffect, useState } from 'react';
import type { KeyboardEvent } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes, radii, sizes } from '../../../theme/tokens.stylex';
import type { ChatChromeVariant } from './ChatComposer';
import { MessageActions } from './MessageActions.js';

const chatBubbleRise = stylex.keyframes({
  from: { opacity: 0, transform: 'translateY(16px) scale(0.98)' },
  to: { opacity: 1, transform: 'translateY(0) scale(1)' },
});

const styles = stylex.create({
  row: {
    display: 'flex',
    justifyContent: 'flex-end',
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  bubble: {
    maxWidth: '88%',
    fontSize: fontSizes.base,
    lineHeight: 1.5,
    overflowWrap: 'anywhere',
    backgroundColor: colors.backgroundElement,
    color: colors.textPrimary,
    padding: '6px 10px',
  },
  bubbleEnter: {
    'animationName': chatBubbleRise,
    'animationDuration': '0.26s',
    'animationTimingFunction': 'cubic-bezier(0.2, 0.9, 0.3, 1)',
    'animationFillMode': 'both',
    'transformOrigin': 'bottom right',
    '@media (prefers-reduced-motion: reduce)': {
      animationName: 'none',
    },
  },
  editor: {
    width: '78%',
    maxWidth: '36ch',
    minHeight: '52px',
    resize: 'vertical',
    backgroundColor: colors.backgroundElement,
    color: colors.textPrimary,
    borderColor: colors.borderStrong,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: radii.md,
    padding: '8px 10px',
    fontFamily: 'inherit',
    fontSize: fontSizes.base,
    lineHeight: 1.5,
    outline: colors.focusOutline,
    boxShadow: colors.focusRing,
  },
  editBar: {
    display: 'flex',
    gap: '6px',
    marginTop: '6px',
  },
  cancel: {
    'fontSize': fontSizes.sm,
    'height': sizes.controlHeight,
    'padding': '0 8px',
    'borderRadius': radii.md,
    'borderStyle': 'solid',
    'borderWidth': '1px',
    'borderColor': colors.border,
    'backgroundColor': colors.backgroundSurface,
    'color': colors.textSecondary,
    'cursor': 'pointer',
    ':active': {
      scale: 0.96,
    },
  },
  send: {
    'fontSize': fontSizes.sm,
    'height': sizes.controlHeight,
    'padding': '0 8px',
    'borderRadius': radii.md,
    'borderStyle': 'none',
    'borderWidth': 0,
    'backgroundColor': colors.accent,
    'color': '#000',
    'cursor': 'pointer',
    ':disabled': {
      backgroundColor: colors.backgroundHover,
      color: colors.textMuted,
      cursor: 'default',
    },
    ':active': {
      scale: 0.96,
    },
  },
});

const userBubbleChrome = stylex.create({
  assistant: {
    borderRadius: radii.userBubble,
  },
  panel: {
    borderRadius: radii.default,
  },
});

export function UserMessageBlock({
  text,
  optimistic,
  variant,
  userBubbleClassName,
  showUserActions,
  userActions,
  editing,
  onSubmitEdit,
  onCancelEdit,
}: {
  text: string;
  optimistic?: boolean;
  variant: ChatChromeVariant;
  userBubbleClassName?: string;
  showUserActions?: boolean;
  userActions?: {
    onRetry?: () => void;
    onEdit?: () => void;
    retryDisabled?: boolean;
    editDisabled?: boolean;
  };
  editing?: boolean;
  onSubmitEdit?: (text: string) => void;
  onCancelEdit?: () => void;
}) {
  const [draft, setDraft] = useState(text);
  useEffect(() => {
    if (editing) setDraft(text);
  }, [editing, text]);

  const submit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSubmitEdit?.(trimmed);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancelEdit?.();
      return;
    }
    if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.shiftKey) return;
    event.preventDefault();
    submit();
  };

  return (
    <div className={`chat-row chat-row--user ${stylex.props(styles.row).className}`}>
      {editing ? (
        <>
          <textarea
            className={stylex.props(styles.editor).className}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            aria-label="编辑提问"
          />
          <div className={stylex.props(styles.editBar).className}>
            <button type="button" className={stylex.props(styles.cancel).className} onClick={onCancelEdit}>
              取消
            </button>
            <button
              type="button"
              className={stylex.props(styles.send).className}
              disabled={!draft.trim()}
              onClick={submit}
            >
              发送
            </button>
          </div>
        </>
      ) : (
        <>
          <div
            className={`chat-bubble chat-bubble--user ${stylex.props(styles.bubble, optimistic && styles.bubbleEnter, userBubbleChrome[variant]).className}${userBubbleClassName ? ` ${userBubbleClassName}` : ''}`}
          >
            {text}
          </div>
          {showUserActions ? (
            <MessageActions
              text={text}
              align="end"
              onRetry={userActions?.onRetry}
              onEdit={userActions?.onEdit}
              retryDisabled={userActions?.retryDisabled}
              editDisabled={userActions?.editDisabled}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
