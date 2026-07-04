import type { ContextNewsItem, ContextNewsSource, ContextNewsTag, IntradayContext, NewsItem } from "../../../../../shared/types";
import { formatMarketMonthDayTime } from "../../../../../shared/time";
import { NewsSection } from "../../NewsSection";

const TAG_LABEL: Record<ContextNewsTag, string> = {
  catalyst: "催化",
  regulatory: "监管",
  sentiment: "情绪",
  macro: "宏观",
};

const SOURCE_LABEL: Record<ContextNewsSource, string> = {
  longbridge: "长桥",
  x: "X",
  trump: "Trump",
  sec: "SEC",
  gdelt: "GDELT",
};

function ContextNewsRow({ item }: { item: ContextNewsItem }) {
  const body = (
    <>
      <span className="news-meta">
        {formatMarketMonthDayTime(item.time)}
        <span className="news-badge context-tag">{TAG_LABEL[item.tag] ?? item.tag}</span>
        <span className="news-badge context-source">{SOURCE_LABEL[item.source] ?? item.source}</span>
      </span>
      <span className="news-title">{item.title}</span>
      {item.note && <div className="zone-meta md">{item.note}</div>}
    </>
  );
  if (item.url) {
    return (
      <a className="news-item" href={item.url} target="_blank" rel="noreferrer">
        {body}
      </a>
    );
  }
  return <div className="news-item">{body}</div>;
}

interface NewsTabProps {
  context: IntradayContext | null;
  news: NewsItem[];
}

export function NewsTab({ context, news }: NewsTabProps) {
  const contextNews = context?.news ?? [];

  return (
    <>
      {contextNews.length > 0 && (
        <>
          <div className="section-title">消息面结论</div>
          {contextNews.map((item, i) => (
            <ContextNewsRow key={i} item={item} />
          ))}
        </>
      )}
      <NewsSection news={news} />
    </>
  );
}
