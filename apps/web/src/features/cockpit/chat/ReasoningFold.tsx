import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes, radii } from '../../../theme/tokens.stylex';

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  button: {
    'display': 'inline-flex',
    'alignItems': 'center',
    'alignSelf': 'flex-start',
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
  body: {
    margin: '2px 0',
    overflow: 'hidden',
    padding: '8px 12px',
    backgroundColor: colors.backgroundSurface,
    borderRadius: radii.lg,
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
});

const foldTransition = { duration: 0.2, ease: [0.2, 0.9, 0.3, 1] } as const;

export function ReasoningFold({ text, streaming }: { text: string; streaming?: boolean }) {
  const [open, setOpen] = useState(Boolean(streaming));

  useEffect(() => {
    setOpen(Boolean(streaming));
  }, [streaming]);

  if (!text) return null;

  return (
    <div className={`chat-reasoning ${stylex.props(styles.root).className}`}>
      <button
        type="button"
        className={`chat-reasoning-btn ${stylex.props(styles.button).className}`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {streaming ? '思考中' : '思考过程'}
        <ChevronRight
          size={12}
          className={stylex.props(styles.caret, open && styles.caretOpen).className}
        />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            className={`chat-reasoning-body ${stylex.props(styles.body).className}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={foldTransition}
          >
            {text}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
