import { useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes, radii } from '../../../theme/tokens.stylex';
import { formatWorkedDuration } from './presentTranscript.js';

const styles = stylex.create({
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    margin: '2px 0',
  },
  button: {
    'display': 'inline-flex',
    'alignItems': 'center',
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
    'lineHeight': 1.3,
    'whiteSpace': 'nowrap',
    ':hover': {
      color: colors.textPrimary,
      borderColor: colors.borderStrong,
    },
  },
  caret: {
    'color': colors.textMuted,
    'transition': 'transform 0.12s ease',
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
  caretOpen: {
    transform: 'rotate(90deg)',
  },
  line: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    height: '1px',
    backgroundColor: colors.border,
  },
  fold: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    margin: '0 0 2px 8px',
    overflow: 'hidden',
    padding: '8px 0 4px 14px',
    borderLeftColor: colors.border,
    borderLeftStyle: 'solid',
    borderLeftWidth: '1px',
  },
});

const foldTransition = { duration: 0.2, ease: [0.2, 0.9, 0.3, 1] } as const;

export function WorkedFold({
  durationMs,
  children,
}: {
  durationMs: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const label = formatWorkedDuration(durationMs);

  return (
    <div className="chat-worked">
      <div className={stylex.props(styles.row).className}>
        <button
          type="button"
          className={`chat-worked-btn ${stylex.props(styles.button).className}`}
          aria-expanded={open}
          aria-label={label}
          onClick={() => setOpen((current) => !current)}
        >
          {label}
          <ChevronRight
            size={12}
            className={stylex.props(styles.caret, open && styles.caretOpen).className}
          />
        </button>
        <span className={stylex.props(styles.line).className} aria-hidden="true" />
      </div>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            className={`chat-worked-fold ${stylex.props(styles.fold).className}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={foldTransition}
          >
            {children}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
