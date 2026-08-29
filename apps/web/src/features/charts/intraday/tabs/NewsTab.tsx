import * as stylex from '@stylexjs/stylex';
import type {
  ContextNewsItem,
  ContextNewsSource,
  ContextNewsTag,
  IntradayContext,
  NewsItem,
} from '@kansoku/shared/types';
import { Badge, MarketTime, SectionTitle, Spinner } from '@web/ui';
import { NewsSection } from '@web/features/charts/NewsSection';
import { useQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';
import { colors, fontSizes } from '../../../../theme/tokens.stylex';

const TAG_LABEL: Record<ContextNewsTag, string> = {
  catalyst: '催化',
  regulatory: '监管',
  sentiment: '情绪',
  macro: '宏观',
};

const SOURCE_LABEL: Record<ContextNewsSource, string> = {
  longbridge: '长桥',
  x: 'X',
  trump: 'Trump',
  sec: 'SEC',
  gdelt: 'GDELT',
};

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
    ':hover .news-title': {
      color: colors.accent,
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
    color: colors.textPrimary,
    display: 'block',
    fontSize: fontSizes.base,
    lineHeight: 1.45,
    marginTop: '3px',
  },
  zoneMeta: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 1.45,
    marginTop: '3px',
  },
});

function ContextNewsRow({ item }: { item: ContextNewsItem }) {
  const body = (
    <>
      <span className={`news-meta ${stylex.props(styles.meta).className}`}>
        <MarketTime value={item.time} format="month-day-time" />
        <Badge tone="accent">{TAG_LABEL[item.tag] ?? item.tag}</Badge>
        <Badge>{SOURCE_LABEL[item.source] ?? item.source}</Badge>
      </span>
      <span className={`news-title ${stylex.props(styles.title).className}`}>{item.title}</span>
      {item.note && (
        <div className={`zone-meta md ${stylex.props(styles.zoneMeta).className}`}>{item.note}</div>
      )}
    </>
  );
  if (item.url) {
    return (
      <a
        className={`news-item ${stylex.props(styles.item).className}`}
        href={item.url}
        target="_blank"
        rel="noreferrer"
      >
        {body}
      </a>
    );
  }
  return <div className={`news-item ${stylex.props(styles.item).className}`}>{body}</div>;
}

interface NewsTabProps {
  context: IntradayContext | null;
  news: NewsItem[];
  sym?: string | null;
}

export function NewsTab({ context, news, sym }: NewsTabProps) {
  const contextNews = context?.news ?? [];
  const { data: fetched, loading } = useQuery<NewsItem[]>(
    sym && news.length === 0 ? `symbols.news:${sym}` : null,
    () => client.symbols.news({ sym: sym! }),
  );
  const items = news.length > 0 ? news : (fetched ?? []);

  return (
    <>
      {contextNews.length > 0 && (
        <>
          <SectionTitle>消息面结论</SectionTitle>
          {contextNews.map((item, i) => (
            <ContextNewsRow key={i} item={item} />
          ))}
        </>
      )}
      {loading && items.length === 0 ? <Spinner /> : <NewsSection news={items} />}
    </>
  );
}
