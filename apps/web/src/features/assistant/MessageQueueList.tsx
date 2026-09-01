import * as stylex from '@stylexjs/stylex';
import { X } from 'lucide-react';
import type { QueueItem } from './messageQueue.js';
import { colors, fontSizes, fonts, radii, sizes } from '../../theme/tokens.stylex';

const styles = stylex.create({
  root: {
    maxHeight: '168px',
    marginBottom: '6px',
    overflow: 'hidden',
    borderColor: colors.border,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: radii.lg,
    backgroundColor: colors.backgroundElement,
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    minHeight: sizes.controlHeight,
    padding: '0 8px',
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: fontSizes.xs,
    letterSpacing: '0.04em',
  },
  count: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '18px',
    height: '18px',
    padding: '0 5px',
    borderRadius: radii.full,
    backgroundColor: colors.backgroundHover,
    color: colors.textSecondary,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: 0,
  },
  items: {
    minWidth: 0,
    maxHeight: '136px',
    overflowY: 'auto',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minHeight: '32px',
    padding: '2px 2px 2px 8px',
    color: colors.textSecondary,
  },
  rowDivider: {
    borderTopColor: colors.border,
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
  },
  text: {
    flex: '1 1 auto',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  error: {
    flex: '0 0 auto',
    fontSize: fontSizes.xs,
    color: colors.down,
  },
  remove: {
    'flex': '0 0 auto',
    'display': 'inline-flex',
    'alignItems': 'center',
    'justifyContent': 'center',
    'width': sizes.controlHeight,
    'height': sizes.controlHeight,
    'borderRadius': radii.full,
    'borderStyle': 'none',
    'backgroundColor': 'transparent',
    'color': {
      'default': colors.textMuted,
      ':hover': colors.textPrimary,
    },
    'cursor': 'pointer',
    'transitionProperty': 'color, background-color, scale',
    'transitionDuration': '120ms',
    'transitionTimingFunction': 'ease-out',
    ':hover': {
      backgroundColor: colors.backgroundHover,
    },
    ':active': {
      scale: 0.96,
    },
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '0.01ms',
    },
  },
});

export function MessageQueueList({
  queue,
  onRemove,
}: {
  queue: QueueItem[];
  onRemove: (id: string) => void;
}) {
  if (queue.length === 0) return null;

  return (
    <div {...stylex.props(styles.root)} aria-label="待发送消息">
      <div {...stylex.props(styles.head)}>
        <span>待发送</span>
        <span {...stylex.props(styles.count)}>{queue.length}</span>
      </div>
      <div {...stylex.props(styles.items)}>
        {queue.map((item, index) => (
          <div key={item.id} {...stylex.props(styles.row, index > 0 && styles.rowDivider)}>
            <span {...stylex.props(styles.text)}>{item.text}</span>
            {item.error ? <span {...stylex.props(styles.error)}>{item.error}</span> : null}
            <button
              type="button"
              {...stylex.props(styles.remove)}
              aria-label="移出队列"
              onClick={() => onRemove(item.id)}
            >
              <X size={12} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
