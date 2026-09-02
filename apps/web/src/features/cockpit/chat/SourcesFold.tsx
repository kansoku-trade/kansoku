import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes, radii } from '../../../theme/tokens.stylex';
import type { ChatSource } from './collectSources.js';

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    marginTop: '6px',
  },
  button: {
    'display': 'inline-flex',
    'alignItems': 'center',
    'alignSelf': 'flex-start',
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
  caret: {
    transition: 'transform 0.12s ease',
  },
  caretOpen: {
    transform: 'rotate(90deg)',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    overflow: 'hidden',
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

const foldTransition = { duration: 0.2, ease: [0.2, 0.9, 0.3, 1] } as const;

export function SourcesFold({ sources }: { sources: ChatSource[] }) {
  const [open, setOpen] = useState(false);
  if (sources.length === 0) return null;

  return (
    <div className={`chat-sources ${stylex.props(styles.root).className}`}>
      <button
        type="button"
        className={`chat-sources-btn ${stylex.props(styles.button).className}`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {sources.length} 个来源
        <ChevronRight
          size={12}
          className={stylex.props(styles.caret, open && styles.caretOpen).className}
        />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            className={stylex.props(styles.list).className}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={foldTransition}
          >
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
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
