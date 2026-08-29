import { useMemo, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { HomeEventItem, HomeEvents } from '@kansoku/shared/types';
import { MarketTime, NoteBlock } from '@web/ui';
import { colors, fontSizes, fonts, radii } from '../../theme/tokens.stylex';

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  nav: {
    alignItems: 'center',
    display: 'flex',
    gap: '6px',
    justifyContent: 'space-between',
    paddingBottom: '2px',
  },
  navButton: {
    'alignItems': 'center',
    'backgroundColor': colors.backgroundSurface,
    'borderColor': colors.border,
    'borderRadius': radii.default,
    'borderStyle': 'solid',
    'borderWidth': '1px',
    'color': colors.textMuted,
    'cursor': 'pointer',
    'display': 'inline-flex',
    'fontFamily': fonts.ui,
    'fontSize': fontSizes.base,
    'height': '22px',
    'justifyContent': 'center',
    'lineHeight': 1,
    'padding': 0,
    'width': '22px',
    ':hover': {
      backgroundColor: colors.backgroundHover,
      color: colors.textPrimary,
    },
  },
  navTitle: {
    'backgroundColor': 'transparent',
    'borderWidth': 0,
    'borderRadius': radii.default,
    'color': colors.textPrimary,
    'cursor': 'pointer',
    'fontFamily': fonts.ui,
    'fontSize': fontSizes.md,
    'fontVariantNumeric': 'tabular-nums',
    'fontWeight': 600,
    'letterSpacing': '0.02em',
    'padding': '2px 6px',
    ':hover': {
      color: colors.accent,
    },
  },
  weekdays: {
    alignItems: 'center',
    color: colors.textMuted,
    display: 'grid',
    fontSize: fontSizes.xs,
    gap: '1px',
    gridTemplateColumns: 'repeat(7, 1fr)',
    paddingBottom: '2px',
    textAlign: 'center',
  },
  grid: {
    display: 'grid',
    gap: '1px',
    gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
  },
  day: {
    'aspectRatio': '1 / 1',
    'backgroundColor': colors.backgroundSurface,
    'borderColor': 'transparent',
    'borderRadius': radii.default,
    'borderStyle': 'solid',
    'borderWidth': '1px',
    'color': colors.textPrimary,
    'cursor': 'pointer',
    'display': 'flex',
    'flexDirection': 'column',
    'fontFamily': fonts.ui,
    'fontSize': fontSizes.sm,
    'justifyContent': 'space-between',
    'minHeight': '30px',
    'padding': '3px 4px 2px',
    'position': 'relative',
    'textAlign': 'left',
    ':hover:not(:disabled)': {
      backgroundColor: colors.backgroundHover,
      borderColor: colors.border,
    },
    ':disabled': {
      backgroundColor: 'transparent',
      cursor: 'default',
    },
  },
  dayOther: {
    backgroundColor: 'transparent',
    color: colors.textMuted,
  },
  daySelected: {
    backgroundColor: colors.backgroundElement,
    borderColor: colors.accent,
  },
  dayNum: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1,
  },
  dayNumOther: {
    color: colors.textMuted,
  },
  dayNumToday: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    color: '#0a0a0a',
    fontWeight: 700,
    padding: '1px 3px',
  },
  dayNumSelected: {
    color: colors.textPrimary,
  },
  dots: {
    alignItems: 'center',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '2px',
  },
  dot: {
    borderRadius: 0,
    display: 'inline-block',
    height: '4px',
    width: '4px',
  },
  dotEarnings: {
    backgroundColor: '#f59e0b',
  },
  dotMacro: {
    backgroundColor: '#818cf8',
  },
  dotOwned: {
    outlineColor: colors.accent,
    outlineStyle: 'solid',
    outlineWidth: '1px',
    outlineOffset: 0,
  },
  dayMore: {
    color: colors.textMuted,
    fontSize: '9px',
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1,
    marginLeft: '1px',
  },
  emptyNote: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    padding: '4px 2px 0',
  },
  strip: {
    borderTopColor: colors.border,
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    marginTop: '4px',
    paddingTop: '8px',
  },
  stripHead: {
    alignItems: 'baseline',
    color: colors.textMuted,
    display: 'flex',
    fontSize: fontSizes.sm,
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 600,
    justifyContent: 'space-between',
  },
  stripClear: {
    'backgroundColor': 'transparent',
    'borderWidth': 0,
    'color': colors.accent,
    'cursor': 'pointer',
    'font': 'inherit',
    'fontWeight': 500,
    'padding': 0,
    ':hover': {
      textDecoration: 'underline',
    },
  },
  stripDay: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '0.02em',
    padding: '4px 0 2px',
  },
  stripGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },
  stripEmpty: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    padding: '4px 0',
  },
  eventItem: {
    backgroundColor: colors.backgroundSurface,
    borderLeftColor: colors.borderStrong,
    borderLeftStyle: 'solid',
    borderLeftWidth: '3px',
    borderRadius: '0 6px 6px 0',
    display: 'flex',
    fontSize: fontSizes.base,
    gap: '8px',
    padding: '6px 8px',
  },
  eventMacro: {
    borderLeftColor: '#818cf8',
  },
  eventEarnings: {
    borderLeftColor: '#f59e0b',
  },
  eventDone: {
    opacity: 0.65,
  },
  eventTime: {
    color: colors.textMuted,
    flexShrink: 0,
    fontVariantNumeric: 'tabular-nums',
    width: '52px',
  },
  eventBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: 0,
  },
  eventTitle: {
    color: colors.textPrimary,
    fontWeight: 600,
  },
  eventDetail: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
  },
});

interface EventCalendarProps {
  events: HomeEvents | null | undefined;
  error: string | null;
  after: boolean;
}

interface DayCell {
  iso: string;
  day: number;
  inMonth: boolean;
}

interface DotDescriptor {
  kind: HomeEventItem['kind'];
  owned: boolean;
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function isoDate(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function parseIso(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

function monthGrid(year: number, month: number): DayCell[] {
  const first = new Date(year, month - 1, 1);
  const dow = first.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const prevDays = new Date(year, month - 1, 0).getDate();
  const cells: DayCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const offset = i - dow;
    let y = year;
    let m = month;
    let d: number;
    if (offset < 0) {
      m -= 1;
      if (m < 1) {
        m = 12;
        y -= 1;
      }
      d = prevDays + offset + 1;
    } else if (offset < daysInMonth) {
      d = offset + 1;
    } else {
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
      d = offset - daysInMonth + 1;
    }
    cells.push({ iso: isoDate(y, m, d), day: d, inMonth: offset >= 0 && offset < daysInMonth });
  }
  return cells;
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

function weekdayOf(iso: string): string {
  const { y, m, d } = parseIso(iso);
  return WEEKDAYS[new Date(y, m - 1, d).getDay()];
}

function dayLabel(iso: string): string {
  const { m, d } = parseIso(iso);
  return `${m}/${d} · 周${weekdayOf(iso)}`;
}

function groupDots(items: HomeEventItem[]): Map<string, DotDescriptor[]> {
  const map = new Map<string, DotDescriptor[]>();
  for (const it of items) {
    const arr = map.get(it.date);
    const dot: DotDescriptor = { kind: it.kind, owned: it.owned };
    if (arr) arr.push(dot);
    else map.set(it.date, [dot]);
  }
  return map;
}

function sortEvents(a: HomeEventItem, b: HomeEventItem): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const at = a.ts ?? '';
  const bt = b.ts ?? '';
  if (at !== bt) return at < bt ? -1 : 1;
  return a.title.localeCompare(b.title);
}

function upcomingWindow(items: HomeEventItem[], todayIso: string): HomeEventItem[] {
  const { y, m, d } = parseIso(todayIso);
  const end = new Date(y, m - 1, d + 7);
  const endIso = isoDate(end.getFullYear(), end.getMonth() + 1, end.getDate());
  return items.filter((i) => i.date >= todayIso && i.date < endIso).sort(sortEvents);
}

function eventKey(item: HomeEventItem): string {
  return `${item.kind}|${item.date}|${item.ts ?? ''}|${item.symbol ?? ''}|${item.title}`;
}

function eventDetail(item: HomeEventItem): string | null {
  const parts: string[] = [];
  if (item.actual != null) parts.push(`实际 ${item.actual}`);
  if (item.estimate != null) parts.push(`预期 ${item.estimate}`);
  if (item.previous != null) parts.push(`前值 ${item.previous}`);
  return parts.length ? parts.join(' · ') : null;
}

function DayDots({ list }: { list: DotDescriptor[] }) {
  const shown = list.slice(0, 3);
  const extra = list.length - shown.length;
  return (
    <span className={`cal-day-dots ${stylex.props(styles.dots).className}`}>
      {shown.map((dot, i) => (
        <span
          // eslint-disable-next-line @eslint-react/no-array-index-key
          key={`${dot.kind}-${dot.owned}-${i}`}
          className={`cal-dot cal-dot--${dot.kind}${dot.owned ? ' cal-dot--owned' : ''} ${stylex.props(styles.dot, dot.kind === 'earnings' ? styles.dotEarnings : styles.dotMacro, dot.owned && styles.dotOwned).className}`}
        />
      ))}
      {extra > 0 && (
        <span className={`cal-day-more ${stylex.props(styles.dayMore).className}`}>+{extra}</span>
      )}
    </span>
  );
}

function StripItem({ item }: { item: HomeEventItem }) {
  const done = item.kind === 'macro' && item.actual != null;
  const detail = eventDetail(item);
  return (
    <div
      className={`event-item event-${item.kind}${done ? ' event-done' : ''} ${stylex.props(styles.eventItem, item.kind === 'macro' ? styles.eventMacro : styles.eventEarnings, done && styles.eventDone).className}`}
    >
      <span className={`event-time ${stylex.props(styles.eventTime).className}`}>
        {item.ts ? <MarketTime value={item.ts} format="clock" /> : item.date.slice(5)}
      </span>
      <span className={`event-body ${stylex.props(styles.eventBody).className}`}>
        <span className={`event-title ${stylex.props(styles.eventTitle).className}`}>
          {item.symbol ? `${item.symbol.replace(/\.US$/, '')} · ` : ''}
          {item.title}
          {item.kind === 'earnings' && item.owned && ' ⚠'}
          {done && ' ✓'}
        </span>
        {detail && (
          <span className={`event-detail ${stylex.props(styles.eventDetail).className}`}>
            {detail}
          </span>
        )}
      </span>
    </div>
  );
}

function EventStrip({
  label,
  items,
  selected,
  onClear,
}: {
  label: string;
  items: HomeEventItem[];
  selected: string | null;
  onClear: () => void;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, HomeEventItem[]>();
    for (const item of items) {
      const arr = map.get(item.date);
      if (arr) arr.push(item);
      else map.set(item.date, [item]);
    }
    return [...map.entries()];
  }, [items]);

  return (
    <div className={`event-strip ${stylex.props(styles.strip).className}`}>
      <div className={`event-strip-head ${stylex.props(styles.stripHead).className}`}>
        <span>{label}</span>
        {selected && (
          <button
            type="button"
            className={`event-strip-clear ${stylex.props(styles.stripClear).className}`}
            onClick={onClear}
          >
            未来 7 天
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <div className={`event-strip-empty ${stylex.props(styles.stripEmpty).className}`}>
          此段无事件
        </div>
      ) : (
        grouped.map(([date, group]) => (
          <div
            className={`event-strip-group ${stylex.props(styles.stripGroup).className}`}
            key={date}
          >
            {!selected && (
              <div className={`event-strip-day ${stylex.props(styles.stripDay).className}`}>
                {dayLabel(date)}
              </div>
            )}
            {group.map((it) => (
              <StripItem key={eventKey(it)} item={it} />
            ))}
          </div>
        ))
      )}
    </div>
  );
}

export function EventCalendar({ events, error, after }: EventCalendarProps) {
  const todayIso =
    events?.date ??
    isoDate(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
  const initial = parseIso(todayIso);
  const [view, setView] = useState({ year: initial.y, month: initial.m });
  const [selected, setSelected] = useState<string | null>(null);

  const dots = useMemo(() => groupDots(events?.items ?? []), [events]);
  const days = useMemo(() => monthGrid(view.year, view.month), [view.year, view.month]);
  const inMonthHasEvents = days.some((d) => d.inMonth && dots.has(d.iso));

  const stripItems = selected
    ? (events?.items ?? []).filter((i) => i.date === selected).sort(sortEvents)
    : upcomingWindow(events?.items ?? [], todayIso);
  const stripLabel = selected
    ? dayLabel(selected)
    : after
      ? '未来 7 天 · 含今日已发生'
      : '未来 7 天';

  if (error) return <NoteBlock>事件日历获取失败，正在重试</NoteBlock>;
  if (!events) return <NoteBlock>事件日历加载中…</NoteBlock>;

  const goto = (delta: number) => setView((v) => shiftMonth(v.year, v.month, delta));
  const resetToday = () => {
    setView({ year: initial.y, month: initial.m });
    setSelected(null);
  };

  return (
    <div className={`event-calendar ${stylex.props(styles.root).className}`}>
      <div className={`cal-nav ${stylex.props(styles.nav).className}`}>
        <button
          type="button"
          className={`cal-nav-btn ${stylex.props(styles.navButton).className}`}
          aria-label="上月"
          onClick={() => goto(-1)}
        >
          ‹
        </button>
        <button
          type="button"
          className={`cal-nav-title ${stylex.props(styles.navTitle).className}`}
          onClick={resetToday}
        >
          {view.year} · {view.month} 月
        </button>
        <button
          type="button"
          className={`cal-nav-btn ${stylex.props(styles.navButton).className}`}
          aria-label="下月"
          onClick={() => goto(1)}
        >
          ›
        </button>
      </div>
      <div className={`cal-weekdays ${stylex.props(styles.weekdays).className}`}>
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className={`cal-grid ${stylex.props(styles.grid).className}`}>
        {days.map((d) => {
          const list = dots.get(d.iso) ?? [];
          const isToday = d.iso === todayIso;
          const isSelected = d.iso === selected;
          const classes = ['cal-day'];
          if (!d.inMonth) classes.push('cal-day--other');
          if (isToday) classes.push('cal-day--today');
          if (isSelected) classes.push('cal-day--selected');
          const disabled = !d.inMonth && list.length === 0;
          return (
            <button
              type="button"
              key={`${d.iso}-${d.day}`}
              className={`${classes.join(' ')} ${stylex.props(styles.day, !d.inMonth && styles.dayOther, isSelected && styles.daySelected).className}`}
              onClick={() => setSelected(isSelected ? null : d.iso)}
              disabled={disabled}
              aria-pressed={isSelected}
              aria-label={`${d.iso}${list.length ? ` · ${list.length} 项事件` : ''}`}
            >
              <span
                className={`cal-day-num ${stylex.props(styles.dayNum, !d.inMonth && styles.dayNumOther, isToday && styles.dayNumToday, isSelected && styles.dayNumSelected).className}`}
              >
                {d.day}
              </span>
              {list.length > 0 && <DayDots list={list} />}
            </button>
          );
        })}
      </div>
      {!inMonthHasEvents && (
        <div className={`cal-empty-note ${stylex.props(styles.emptyNote).className}`}>
          此月无预告事件（事件预告仅覆盖近期）
        </div>
      )}
      <EventStrip
        label={stripLabel}
        items={stripItems}
        selected={selected}
        onClear={() => setSelected(null)}
      />
    </div>
  );
}
