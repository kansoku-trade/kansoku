import { CalendarClock } from 'lucide-react';
import { localTimeZone } from '@kansoku/shared/time';
import type { IntradayEventRisk, MacroEventItem } from '@kansoku/shared/types';
import {
  type TimeDisplayPreference,
  useTimeDisplayPreference,
} from '@web/lib/timeDisplayPreference';
import { MarketTime, resolveMarketTimePresentation } from '@web/ui/MarketTime';
import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes, radii } from '../../../theme/tokens.stylex';

interface EventRiskCardProps {
  eventRisk: IntradayEventRisk | null | undefined;
}

interface EarningsEventRow {
  dateKey: string;
  key: string;
  kind: 'earnings';
  title: string;
}

interface MacroEventRow {
  dateKey: string;
  event: MacroEventItem;
  key: string;
  kind: 'macro';
  title: string;
}

type EventRow = EarningsEventRow | MacroEventRow;

interface EventGroup {
  dateKey: string;
  rows: EventRow[];
}

const styles = stylex.create({
  card: {
    backgroundColor: colors.backgroundSurface,
    borderColor: colors.border,
    borderRadius: radii.default,
    borderStyle: 'solid',
    borderWidth: '1px',
    marginBottom: '14px',
    padding: '10px 12px',
  },
  label: {
    alignItems: 'center',
    color: colors.textSecondary,
    display: 'flex',
    fontSize: fontSizes.sm,
    gap: '5px',
    letterSpacing: '0.08em',
    marginBottom: '6px',
    textTransform: 'uppercase',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
  },
  groupSeparated: {
    borderTopColor: `color-mix(in srgb, ${colors.border} 70%, transparent)`,
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
    marginTop: '7px',
    paddingTop: '7px',
  },
  day: {
    color: colors.textMuted,
    display: 'block',
    fontSize: fontSizes.sm,
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 600,
    letterSpacing: '0.04em',
    marginBottom: '2px',
  },
  items: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  row: {
    alignItems: 'baseline',
    columnGap: '8px',
    display: 'grid',
    fontSize: fontSizes.control,
    gridTemplateColumns: '42px minmax(0, 1fr)',
    lineHeight: 1.55,
  },
  time: {
    color: colors.textMuted,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  title: {
    color: colors.textPrimary,
    fontWeight: 600,
    minWidth: 0,
  },
  icon: {
    verticalAlign: '-2px',
  },
});

function macroEventDateKey(
  timestamp: string,
  preference: TimeDisplayPreference,
  timeZone: string,
): string {
  return resolveMarketTimePresentation({
    value: timestamp,
    preference,
    timeZone,
    format: 'date-time',
    includeZone: false,
  }).label.split(' ')[0];
}

function macroEventTitle(event: MacroEventItem): string {
  const detail = event.estimate
    ? `（预期 ${event.estimate}）`
    : event.previous
      ? `（前值 ${event.previous}）`
      : '';
  return `${event.title}${detail}`;
}

function groupEvents(eventRisk: IntradayEventRisk, preference: TimeDisplayPreference) {
  const timeZone = localTimeZone();
  const rows: EventRow[] = eventRisk.macro.map((event) => ({
    dateKey: macroEventDateKey(event.ts, preference, timeZone),
    event,
    key: `${event.ts}-${event.title}`,
    kind: 'macro',
    title: macroEventTitle(event),
  }));

  if (eventRisk.next_earnings) {
    rows.push({
      dateKey: eventRisk.next_earnings.date.slice(0, 10),
      key: `earnings-${eventRisk.next_earnings.date}-${eventRisk.next_earnings.title}`,
      kind: 'earnings',
      title: eventRisk.next_earnings.title,
    });
  }

  const groups = new Map<string, EventRow[]>();
  for (const row of rows) {
    const group = groups.get(row.dateKey);
    if (group) group.push(row);
    else groups.set(row.dateKey, [row]);
  }

  return [...groups.entries()]
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([dateKey, groupedRows]): EventGroup => ({ dateKey, rows: groupedRows }));
}

export function EventRiskCard({ eventRisk }: EventRiskCardProps) {
  const preference = useTimeDisplayPreference();
  if (!eventRisk) return null;
  const { next_earnings, macro } = eventRisk;
  if (!next_earnings && !macro.length) return null;
  const groups = groupEvents(eventRisk, preference);

  return (
    <div className={`event-card ${stylex.props(styles.card).className}`}>
      <div className={`event-card-label ${stylex.props(styles.label).className}`}>
        <CalendarClock className={`icon ${stylex.props(styles.icon).className}`} size={13} />{' '}
        事件风险
      </div>
      <div className={`event-card-list ${stylex.props(styles.list).className}`}>
        {groups.map((group, groupIndex) => (
          <section
            className={`event-card-group${
              groupIndex > 0 ? ` ${stylex.props(styles.groupSeparated).className}` : ''
            }`}
            key={group.dateKey}
          >
            <time
              className={`event-card-day ${stylex.props(styles.day).className}`}
              dateTime={group.dateKey}
            >
              {group.dateKey.slice(5)}
            </time>
            <div className={`event-card-items ${stylex.props(styles.items).className}`}>
              {group.rows.map((row) => (
                <div
                  className={`event-card-row ${stylex.props(styles.row).className}`}
                  key={row.key}
                >
                  <span className={`event-card-time ${stylex.props(styles.time).className}`}>
                    {row.kind === 'macro' ? (
                      <MarketTime value={row.event.ts} format="clock" />
                    ) : (
                      '财报'
                    )}
                  </span>
                  <span className={`event-card-title ${stylex.props(styles.title).className}`}>
                    {row.title}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
