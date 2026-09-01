import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes, radii, sizes } from '../../theme/tokens.stylex';
import type { MentionCandidate } from './atMention.js';

const styles = stylex.create({
  popover: {
    backgroundColor: colors.backgroundSurface,
    borderColor: colors.borderStrong,
    borderRadius: radii.lg,
    borderStyle: 'solid',
    borderWidth: '1px',
    boxShadow: '0 4px 16px rgb(0 0 0 / 0.45)',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    maxHeight: '240px',
    overflowY: 'auto',
    padding: '4px',
  },
  item: {
    'alignItems': 'baseline',
    'backgroundColor': 'transparent',
    'borderColor': 'transparent',
    'borderStyle': 'none',
    'borderWidth': 0,
    'borderRadius': radii.lg,
    'cursor': 'pointer',
    'display': 'flex',
    'gap': '8px',
    'minHeight': sizes.controlHeight,
    'padding': '4px 8px',
    'textAlign': 'left',
    ':hover': {
      backgroundColor: colors.backgroundHover,
    },
  },
  itemActive: {
    backgroundColor: colors.backgroundHover,
  },
  title: {
    color: colors.textPrimary,
    flex: '0 1 auto',
    fontSize: fontSizes.sm,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  path: {
    color: colors.textMuted,
    flex: '1 1 auto',
    fontSize: fontSizes.xs,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  empty: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    padding: '12px',
  },
});

export function AtMentionPopover({
  candidates,
  activeIndex,
  onPick,
}: {
  candidates: MentionCandidate[];
  activeIndex: number;
  onPick: (candidate: MentionCandidate) => void;
}) {
  if (candidates.length === 0) {
    return (
      <div {...stylex.props(styles.popover)}>
        <div {...stylex.props(styles.empty)}>没有匹配的文件</div>
      </div>
    );
  }

  return (
    <div {...stylex.props(styles.popover)} role="listbox" aria-label="研究资料">
      {candidates.map((candidate, index) => (
        <button
          type="button"
          key={candidate.path}
          role="option"
          aria-selected={index === activeIndex}
          className={`${index === activeIndex ? 'active ' : ''}${stylex.props(styles.item, index === activeIndex && styles.itemActive).className}`}
          onMouseDown={(event) => {
            event.preventDefault();
            onPick(candidate);
          }}
        >
          <span {...stylex.props(styles.title)}>{candidate.title}</span>
          <span {...stylex.props(styles.path)}>{candidate.path}</span>
        </button>
      ))}
    </div>
  );
}
