import type { NewsItem } from '@kansoku/shared/types';
import * as stylex from '@stylexjs/stylex';
import { Badge, MarketTime, SectionTitle } from '../../ui';
import { colors, fontSizes } from '../../theme/tokens.stylex';

const styles = stylex.create({
  item: {
    'backgroundColor': colors.backgroundSurface,
    'borderLeftColor': colors.borderStrong,
    'borderLeftStyle': 'solid',
    'borderLeftWidth': '2px',
    'display': 'block',
    'marginBottom': '4px',
    'padding': '7px 8px',
    'textDecoration': 'none',
    ':hover': {
      borderLeftColor: colors.accent,
      textDecoration: 'none',
    },
  },
  meta: {
    alignItems: 'center',
    color: colors.textMuted,
    display: 'flex',
    fontSize: fontSizes.xs,
    fontVariantNumeric: 'tabular-nums',
    gap: '6px',
  },
  title: {
    'color': colors.textPrimary,
    'display': 'block',
    'fontSize': fontSizes.base,
    'lineHeight': 1.45,
    'marginTop': '3px',
    ':hover': {
      color: colors.accent,
    },
  },
});

export function NewsSection({ news }: { news: NewsItem[] }) {
  if (!news.length) return null;

  return (
    <>
      <SectionTitle>相关新闻</SectionTitle>
      {news.map((n) => {
        const community = n.url.includes('/topics/');
        return (
          <a
            key={n.id}
            className={`news-item ${stylex.props(styles.item).className}`}
            href={n.url}
            rel="noreferrer"
            target="_blank"
          >
            <span className={`news-meta ${stylex.props(styles.meta).className}`}>
              <MarketTime value={n.published_at} format="month-day-time" />
              <Badge>{community ? '社区' : '新闻'}</Badge>
            </span>
            <span className={`news-title ${stylex.props(styles.title).className}`}>{n.title}</span>
          </a>
        );
      })}
      <div className="note-block">社区帖为用户观点，非权威信源；引用数据前先核对原始来源</div>
    </>
  );
}
