import type { NewsItem } from '@kansoku/shared/types';
import { Badge, MarketTime, SectionTitle } from '../ui';

export function NewsSection({ news }: { news: NewsItem[] }) {
  if (!news.length) return null;

  return (
    <>
      <SectionTitle>相关新闻</SectionTitle>
      {news.map((n) => {
        const community = n.url.includes('/topics/');
        return (
          <a key={n.id} className="news-item" href={n.url} target="_blank" rel="noreferrer">
            <span className="news-meta">
              <MarketTime value={n.published_at} format="month-day-time" />
              <Badge>{community ? '社区' : '新闻'}</Badge>
            </span>
            <span className="news-title">{n.title}</span>
          </a>
        );
      })}
      <div className="note-block">社区帖为用户观点，非权威信源；引用数据前先核对原始来源</div>
    </>
  );
}
