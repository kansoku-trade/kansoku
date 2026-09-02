import { LayoutTemplate } from 'lucide-react';
import * as stylex from '@stylexjs/stylex';
import { colors, fonts, fontSizes, radii } from '../../theme/tokens.stylex';
import type { CanvasEntry } from './canvasEntries';

const styles = stylex.create({
  card: {
    backgroundColor: colors.backgroundSurface,
    borderRadius: radii.lg,
    marginTop: '2px',
    overflow: 'hidden',
    padding: '0 0 4px',
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 12px 6px',
  },
  thumb: {
    alignItems: 'center',
    backgroundColor: `color-mix(in srgb, ${colors.accent} 7%, transparent)`,
    borderColor: `color-mix(in srgb, ${colors.accent} 18%, transparent)`,
    borderRadius: radii.lg,
    borderStyle: 'solid',
    borderWidth: '1px',
    color: colors.accent,
    display: 'inline-flex',
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    height: '28px',
    justifyContent: 'center',
    width: '28px',
  },
  kicker: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: 600,
  },
  sub: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    marginTop: '2px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '6px 12px',
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
  },
  slug: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: fontSizes.sm,
    marginTop: '2px',
  },
  open: {
    'backgroundColor': 'transparent',
    'borderStyle': 'none',
    'borderWidth': 0,
    'color': colors.textSecondary,
    'cursor': 'pointer',
    'fontSize': fontSizes.sm,
    'padding': 0,
    ':hover': {
      color: colors.textPrimary,
      textDecoration: 'underline',
    },
  },
});

export function TurnCanvases({
  entries,
  onOpen,
}: {
  entries: CanvasEntry[];
  onOpen?: (slug: string) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <div className={`chat-turn-canvases ${stylex.props(styles.card).className}`}>
      <div className={stylex.props(styles.head).className}>
        <div className={stylex.props(styles.thumb).className} aria-hidden="true">
          <LayoutTemplate size={15} />
        </div>
        <div>
          <div className={stylex.props(styles.kicker).className}>{entries.length} 张画布</div>
          <div className={stylex.props(styles.sub).className}>本轮保存</div>
        </div>
      </div>
      {entries.map((entry) => (
        <div className={stylex.props(styles.row).className} key={entry.slug}>
          <div>
            <div className={stylex.props(styles.title).className}>{entry.title}</div>
            <div className={stylex.props(styles.slug).className}>{entry.slug}</div>
          </div>
          {onOpen ? (
            <button
              type="button"
              className={`link-button ${stylex.props(styles.open).className}`}
              onClick={() => onOpen(entry.slug)}
            >
              打开
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
