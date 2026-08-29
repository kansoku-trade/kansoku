import { TimeAgo } from '@web/ui';
import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes, radii } from '../../theme/tokens.stylex';

const styles = stylex.create({
  card: {
    backgroundColor: colors.backgroundSurface,
    borderColor: colors.border,
    borderRadius: radii.default,
    borderStyle: 'solid',
    borderWidth: '1px',
    display: 'flex',
    gap: '10px',
    margin: '8px 0 4px',
    padding: '10px',
  },
  thumb: {
    backgroundImage: `linear-gradient(180deg, ${colors.backgroundElement}, ${colors.backgroundCanvas})`,
    borderColor: colors.border,
    borderRadius: '4px',
    borderStyle: 'solid',
    borderWidth: '1px',
    flex: '0 0 72px',
    height: '48px',
  },
  body: {
    flex: '1 1 auto',
    minWidth: 0,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
  },
  meta: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    marginTop: '2px',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    marginTop: '8px',
  },
  action: {
    'backgroundColor': 'transparent',
    'border': 'none',
    'color': colors.textSecondary,
    'cursor': 'pointer',
    'fontSize': fontSizes.xs,
    'padding': 0,
    ':hover': {
      color: colors.textPrimary,
      textDecoration: 'underline',
    },
  },
  disabledAction: {
    'backgroundColor': 'transparent',
    'border': 'none',
    'color': colors.textSecondary,
    'cursor': 'default',
    'fontSize': fontSizes.xs,
    'opacity': 0.4,
    'padding': 0,
    ':hover': {
      color: colors.textSecondary,
      textDecoration: 'none',
    },
  },
});

export function CanvasCard({
  slug,
  title,
  mtime,
  onOpen,
  onSource,
}: {
  slug: string;
  title: string;
  mtime?: string;
  onOpen: () => void;
  onSource: () => void;
}) {
  return (
    <div className={`canvas-card ${stylex.props(styles.card).className}`}>
      <div
        className={`canvas-card-thumb ${stylex.props(styles.thumb).className}`}
        aria-hidden="true"
      />
      <div className={`canvas-card-body ${stylex.props(styles.body).className}`}>
        <div className={`canvas-card-title ${stylex.props(styles.title).className}`}>{title}</div>
        <div className={`canvas-card-meta ${stylex.props(styles.meta).className}`}>
          <span>{slug}</span>
          {mtime ? (
            <>
              <span aria-hidden="true"> · </span>
              <TimeAgo since={mtime} />
            </>
          ) : null}
        </div>
        <div className={`canvas-card-actions ${stylex.props(styles.actions).className}`}>
          <button
            type="button"
            className={`link-button ${stylex.props(styles.action).className}`}
            onClick={onOpen}
          >
            打开
          </button>
          <button
            type="button"
            className={`link-button ${stylex.props(styles.disabledAction).className}`}
            disabled
            title="本版暂不支持新窗口"
          >
            新窗口
          </button>
          <button
            type="button"
            className={`link-button ${stylex.props(styles.action).className}`}
            onClick={onSource}
          >
            源码
          </button>
        </div>
      </div>
    </div>
  );
}
