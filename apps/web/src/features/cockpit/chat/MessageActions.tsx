import { Check, Copy, Pencil, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors, radii, sizes } from '../../../theme/tokens.stylex';

const styles = stylex.create({
  row: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
    marginTop: '4px',
  },
  alignStart: {
    alignSelf: 'flex-start',
  },
  alignEnd: {
    alignSelf: 'flex-end',
  },
  button: {
    'display': 'inline-flex',
    'alignItems': 'center',
    'justifyContent': 'center',
    'width': sizes.controlHeight,
    'height': sizes.controlHeight,
    'padding': 0,
    'backgroundColor': 'transparent',
    'borderStyle': 'none',
    'borderWidth': 0,
    'borderRadius': radii.md,
    'color': colors.textMuted,
    'cursor': 'pointer',
    ':hover': {
      color: colors.textPrimary,
      backgroundColor: colors.backgroundHover,
    },
    ':active': {
      scale: 0.96,
    },
    ':disabled': {
      opacity: 0.28,
      cursor: 'default',
      color: colors.textMuted,
      backgroundColor: 'transparent',
    },
  },
});

export function MessageActions({
  text,
  onRetry,
  onEdit,
  align = 'start',
  retryDisabled,
  editDisabled,
}: {
  text: string;
  onRetry?: () => void;
  onEdit?: () => void;
  align?: 'start' | 'end';
  retryDisabled?: boolean;
  editDisabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div
      className={`chat-message-actions ${stylex.props(styles.row, align === 'end' ? styles.alignEnd : styles.alignStart).className}`}
    >
      <button
        type="button"
        className={stylex.props(styles.button).className}
        aria-label={copied ? '已复制' : '复制'}
        onClick={() => {
          void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          });
        }}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
      {onEdit ? (
        <button
          type="button"
          className={stylex.props(styles.button).className}
          aria-label="编辑"
          disabled={editDisabled}
          onClick={onEdit}
        >
          <Pencil size={13} />
        </button>
      ) : null}
      {onRetry ? (
        <button
          type="button"
          className={stylex.props(styles.button).className}
          aria-label="重试"
          disabled={retryDisabled}
          onClick={onRetry}
        >
          <RotateCcw size={13} />
        </button>
      ) : null}
    </div>
  );
}
