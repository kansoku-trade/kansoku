import { useLayoutEffect, useRef, useState } from 'react';

export const TIMELINE_PAGE = 10;

export type TimelineItem = { date: string; day: string; monthLabel: string | null };

export function buildTimelineItems(datesAsc: string[]): TimelineItem[] {
  const newestYear = datesAsc.length > 0 ? datesAsc.at(-1)!.slice(0, 4) : '';
  return datesAsc.map((date, i) => {
    const [y, m, d] = date.split('-');
    const prev = datesAsc[i - 1];
    const isMonthStart = !prev || prev.slice(0, 7) !== date.slice(0, 7);
    const monthLabel = isMonthStart
      ? y === newestYear
        ? `${Number(m)}月`
        : `${y}年${Number(m)}月`
      : null;
    return { date, day: String(Number(d)), monthLabel };
  });
}

export function DateTimeline({
  dates,
  selected,
  onSelect,
}: {
  dates: string[];
  selected: string;
  onSelect: (date: string) => void;
}) {
  const [expanded, setExpanded] = useState(TIMELINE_PAGE);
  const count = Math.min(dates.length, Math.max(expanded, dates.indexOf(selected) + 1));
  const items = buildTimelineItems(dates.slice(0, count).reverse());
  const remaining = dates.length - count;

  const scrollerRef = useRef<HTMLDivElement>(null);
  const prevWidth = useRef(0);
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollLeft += el.scrollWidth - prevWidth.current;
    prevWidth.current = el.scrollWidth;
  }, [items.length]);

  return (
    <div className="date-timeline" ref={scrollerRef}>
      <div className="dtl-track">
        {remaining > 0 && (
          <button className="dtl-earlier" onClick={() => setExpanded(count + TIMELINE_PAGE)}>
            更早
          </button>
        )}
        {items.map((it, i) => (
          <button
            key={it.date}
            className={`dtl-item${it.date === selected ? ' active' : ''}${it.monthLabel && i > 0 ? ' month-start' : ''}`}
            title={it.date}
            onClick={() => onSelect(it.date)}
          >
            <span className="dtl-month">{it.monthLabel ?? ' '}</span>
            <span className="dtl-dot" />
            <span className="dtl-day">{it.day}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
