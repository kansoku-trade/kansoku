import * as stylex from '@stylexjs/stylex';
import { AtSign, X } from 'lucide-react';
import { colors, fontSizes, radii, sizes } from '../../theme/tokens.stylex';
import type { MentionCandidate } from './atMention.js';

const styles = stylex.create({
  root: {
    alignItems: 'center',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px 12px',
    padding: '2px 2px 4px',
  },
  reference: {
    alignItems: 'center',
    backgroundColor: colors.backgroundSurface,
    borderColor: colors.border,
    borderRadius: radii.full,
    borderStyle: 'solid',
    borderWidth: '1px',
    color: colors.textSecondary,
    display: 'inline-flex',
    fontSize: fontSizes.xs,
    gap: '5px',
    height: sizes.controlHeight,
    maxWidth: 'min(100%, 360px)',
    minWidth: 0,
    padding: '0 3px 0 7px',
  },
  icon: {
    color: colors.accent,
    flex: '0 0 auto',
  },
  title: {
    color: colors.textSecondary,
    flex: '0 0 auto',
  },
  path: {
    color: colors.textMuted,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  remove: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderStyle: 'none',
    borderWidth: 0,
    borderRadius: radii.full,
    color: colors.textMuted,
    cursor: 'pointer',
    display: 'inline-flex',
    flex: '0 0 auto',
    height: '20px',
    justifyContent: 'center',
    padding: 0,
    transitionDuration: '120ms',
    transitionProperty: 'color, background-color, scale',
    transitionTimingFunction: 'ease-out',
    width: '20px',
    ':hover': {
      backgroundColor: colors.backgroundHover,
      color: colors.textPrimary,
    },
    ':active': {
      scale: 0.96,
    },
  },
});

export function ComposerReferences({
  references,
  onRemove,
}: {
  references: MentionCandidate[];
  onRemove: (path: string) => void;
}) {
  if (references.length === 0) return null;

  return (
    <div
      className={`assistant-composer-references ${stylex.props(styles.root).className}`}
      aria-label="已引用的研究资料"
    >
      {references.map((reference) => (
        <span
          className={`assistant-composer-reference ${stylex.props(styles.reference).className}`}
          key={reference.path}
        >
          <AtSign size={12} aria-hidden="true" {...stylex.props(styles.icon)} />
          <span
            className={`assistant-composer-reference-title ${stylex.props(styles.title).className}`}
          >
            {reference.title}
          </span>
          <span
            className={`assistant-composer-reference-path ${stylex.props(styles.path).className}`}
          >
            {reference.path}
          </span>
          <button
            type="button"
            {...stylex.props(styles.remove)}
            aria-label={`移除 ${reference.title}`}
            onClick={() => onRemove(reference.path)}
          >
            <X size={11} aria-hidden="true" />
          </button>
        </span>
      ))}
    </div>
  );
}
