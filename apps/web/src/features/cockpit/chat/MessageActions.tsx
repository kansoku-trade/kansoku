import { Check, Copy, RotateCcw } from 'lucide-react';
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
  },
});

export function MessageActions({
  text,
  onRetry,
}: {
  text: string;
  onRetry?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className={`chat-message-actions ${stylex.props(styles.row).className}`}>
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
      {onRetry ? (
        <button
          type="button"
          className={stylex.props(styles.button).className}
          aria-label="重试"
          onClick={onRetry}
        >
          <RotateCcw size={13} />
        </button>
      ) : null}
    </div>
  );
}
