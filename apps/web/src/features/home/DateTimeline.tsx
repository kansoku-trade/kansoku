import { useLayoutEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes, fonts, radii } from '../../theme/tokens.stylex';
import { timelineState } from './DateTimeline.stylex';

const TIMELINE_PAGE = 10;

const styles = stylex.create({
  root: {
    margin: '8px 0 12px',
    overflowX: 'auto',
    scrollbarWidth: 'thin',
  },
  track: {
    'boxSizing': 'border-box',
    'display': 'inline-flex',
    'minWidth': '100%',
    'padding': '2px 8px',
    'position': 'relative',
    '::before': {
      backgroundColor: colors.borderStrong,
      content: '""',
      height: '1px',
      left: '8px',
      position: 'absolute',
      right: '8px',
      top: '24px',
    },
  },
  item: {
    [timelineState.dayColor]: {
      'default': colors.textSecondary,
      ':hover': colors.textPrimary,
    },
    [timelineState.dotBorderColor]: {
      'default': colors.borderStrong,
      ':hover': colors.accent,
    },
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderStyle: 'none',
    borderWidth: 0,
    cursor: 'pointer',
    display: 'flex',
    flex: 'none',
    flexDirection: 'column',
    fontFamily: fonts.ui,
    padding: 0,
    position: 'relative',
    width: '48px',
  },
  itemMonthStart: {
    borderLeftColor: colors.border,
    borderLeftStyle: 'solid',
    borderLeftWidth: '1px',
  },
  month: {
    alignSelf: 'flex-start',
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    height: '14px',
    lineHeight: '14px',
    paddingLeft: '2px',
    whiteSpace: 'nowrap',
  },
  dot: {
    backgroundColor: colors.backgroundCanvas,
    borderColor: timelineState.dotBorderColor,
    borderRadius: radii.full,
    borderStyle: 'solid',
    borderWidth: '1px',
    boxSizing: 'border-box',
    height: '7px',
    margin: '5px 0 4px',
    position: 'relative',
    width: '7px',
    zIndex: 1,
  },
  dotActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    height: '9px',
    margin: '4px 0 3px',
    width: '9px',
  },
  day: {
    color: timelineState.dayColor,
    fontSize: fontSizes.sm,
    fontVariantNumeric: 'tabular-nums',
  },
  dayActive: {
    color: colors.accent,
  },
  earlier: {
    'alignSelf': 'flex-start',
    'backgroundColor': colors.backgroundCanvas,
    'borderColor': colors.borderStrong,
    'borderRadius': radii.default,
    'borderStyle': 'solid',
    'borderWidth': '1px',
    'color': colors.textSecondary,
    'cursor': 'pointer',
    'flex': 'none',
    'fontFamily': fonts.ui,
    'fontSize': fontSizes.xs,
    'height': '17px',
    'margin': '16px 10px 0 0',
    'padding': '0 6px',
    'position': 'relative',
    'zIndex': 1,
    ':hover': {
      borderColor: colors.accent,
      color: colors.accent,
    },
  },
});

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
    <div className={`date-timeline ${stylex.props(styles.root).className}`} ref={scrollerRef}>
      <div className={`dtl-track ${stylex.props(styles.track).className}`}>
        {remaining > 0 && (
          <button
            {...stylex.props(styles.earlier)}
            onClick={() => setExpanded(count + TIMELINE_PAGE)}
          >
            更早
          </button>
        )}
        {items.map((it, i) => (
          <button
            key={it.date}
            className={`dtl-item${it.date === selected ? ' active' : ''}${it.monthLabel && i > 0 ? ' month-start' : ''} ${stylex.props(styles.item, it.monthLabel !== null && i > 0 && styles.itemMonthStart).className}`}
            title={it.date}
            onClick={() => onSelect(it.date)}
          >
            <span className={`dtl-month ${stylex.props(styles.month).className}`}>
              {it.monthLabel ?? ' '}
            </span>
            <span
              className={`dtl-dot ${stylex.props(styles.dot, it.date === selected && styles.dotActive).className}`}
            />
            <span
              className={`dtl-day ${stylex.props(styles.day, it.date === selected && styles.dayActive).className}`}
            >
              {it.day}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
