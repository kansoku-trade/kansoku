import { type Market, marketTimeZone } from './time.js';
import type { RawBar } from './types.js';

export type SessionTag = 'pre' | 'reg' | 'post';
export type SessionFilter = 'all' | 'reg';

export interface EncodeKlineTextInput {
  symbol: string;
  period: string;
  bars: RawBar[];
  market?: Market;
  indicators?: Record<string, readonly (number | null)[]>;
  sessions?: SessionFilter;
}

const PRE_START_MIN = 4 * 60;
const REG_START_MIN = 9 * 60 + 30;
const REG_END_MIN = 16 * 60;
const HALF_DAY_REG_END_MIN = 13 * 60;
const POST_END_MIN = 20 * 60;

const DAILY_PERIODS = new Set(['day', 'week', 'month', 'year', '1d', '1w']);

const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

function zoneParts(time: string, timeZone: string) {
  let formatter = zoneFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    zoneFormatters.set(timeZone, formatter);
  }
  const parsed = new Date(time);
  if (Number.isNaN(parsed.getTime())) throw new Error(`invalid bar time: ${time}`);
  const parts = formatter.formatToParts(parsed);
  const pick = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
  return {
    date: `${pick('year')}-${pick('month')}-${pick('day')}`,
    minutes: Number(pick('hour')) * 60 + Number(pick('minute')),
    clock: `${pick('hour')}:${pick('minute')}`,
  };
}

function dayOfWeek(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

function addDays(isoDate: string, delta: number): string {
  const value = new Date(`${isoDate}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + delta);
  return value.toISOString().slice(0, 10);
}

function nextWeekday(isoDate: string): string {
  let next = addDays(isoDate, 1);
  while (dayOfWeek(next) === 0 || dayOfWeek(next) === 6) next = addDays(next, 1);
  return next;
}

// No half-day calendar ships with this repo, so the three recurring NYSE early
// closes are computed. Erring toward "half day" is the safe direction: if the
// market turned out to be fully closed there are no bars to mislabel, whereas
// treating a real half day as a full day would tag post-market bars as regular.
export function isUsHalfDay(isoDate: string): boolean {
  const [, month, day] = isoDate.split('-').map(Number);
  const weekday = dayOfWeek(isoDate);
  if (weekday === 0 || weekday === 6) return false;
  if (month === 7 && day === 3) return true;
  if (month === 12 && day === 24) return true;
  if (month === 11 && weekday === 5) {
    const fourthThursday = thanksgiving(isoDate);
    return fourthThursday !== null && addDays(fourthThursday, 1) === isoDate;
  }
  return false;
}

function thanksgiving(isoDate: string): string | null {
  const year = Number(isoDate.slice(0, 4));
  let thursdays = 0;
  for (let day = 1; day <= 30; day += 1) {
    const candidate = `${year}-11-${String(day).padStart(2, '0')}`;
    if (dayOfWeek(candidate) === 4) {
      thursdays += 1;
      if (thursdays === 4) return candidate;
    }
  }
  return null;
}

function sessionOf(minutes: number, tradingDate: string): SessionTag {
  if (minutes >= POST_END_MIN || minutes < PRE_START_MIN) return 'pre';
  if (minutes < REG_START_MIN) return 'pre';
  const regEnd = isUsHalfDay(tradingDate) ? HALF_DAY_REG_END_MIN : REG_END_MIN;
  return minutes < regEnd ? 'reg' : 'post';
}

function numberOf(value: string | number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`invalid numeric bar value: ${value}`);
  return parsed;
}

function price(value: string | number): string {
  const parsed = numberOf(value);
  return parsed < 1 && parsed > -1 ? parsed.toFixed(4) : parsed.toFixed(2);
}

function volume(value: string | number): string {
  return String(Math.round(numberOf(value)));
}

function indicator(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  return String(Number(value.toPrecision(4)));
}

interface EncodedRow {
  tradingDate: string;
  session: SessionTag;
  label: string;
  cells: string[];
}

function buildRows(
  input: EncodeKlineTextInput,
  timeZone: string,
  intraday: boolean,
  segmented: boolean,
): EncodedRow[] {
  const names = Object.keys(input.indicators ?? {});
  for (const name of names) {
    const series = input.indicators![name]!;
    if (series.length !== input.bars.length) {
      throw new Error(
        `indicator "${name}" has ${series.length} values for ${input.bars.length} bars; they must align one-to-one`,
      );
    }
  }

  return input.bars.map((bar, index) => {
    const { date, minutes, clock } = zoneParts(bar.time, timeZone);
    const rolled = segmented && minutes >= POST_END_MIN ? nextWeekday(date) : date;
    const cells = [
      price(bar.open),
      price(bar.high),
      price(bar.low),
      price(bar.close),
      volume(bar.volume),
      ...names.map((name) => indicator(input.indicators![name]![index])),
    ];
    return {
      tradingDate: rolled,
      session: segmented ? sessionOf(minutes, rolled) : 'reg',
      label: intraday ? clock : date,
      cells,
    };
  });
}

export function encodeKlineText(input: EncodeKlineTextInput): string {
  const market = input.market ?? 'US';
  const timeZone = marketTimeZone(market);
  const intraday = !DAILY_PERIODS.has(input.period);
  const segmented = intraday && market === 'US';

  let rows = buildRows(input, timeZone, intraday, segmented);
  const wanted = input.sessions === 'reg';
  const filtered = wanted && segmented;
  if (filtered) rows = rows.filter((row) => row.session === 'reg');

  // A requested-but-unhonoured filter has to say so: a series that silently kept
  // its extended-hours bars while the caller believes it is regular-session only
  // is the exact misread this encoding exists to prevent.
  const scope = filtered
    ? '仅盘中'
    : segmented
      ? '全时段'
      : wanted
        ? '未分时段（该市场不支持时段过滤，已返回全部）'
        : '未分时段';
  const zoneLabel = market === 'US' ? 'ET' : market === 'HK' ? 'HKT' : 'CST';
  const columns = ['time', 'o', 'h', 'l', 'c', 'v', ...Object.keys(input.indicators ?? {})];

  const lines = [
    `# ${input.symbol} ${input.period} · ${zoneLabel} · ${scope} · ${rows.length} 根`,
    `# ${columns.join(',')}`,
  ];

  let segment = '';
  for (const row of rows) {
    if (segmented) {
      const header = `${row.tradingDate} ${row.session}`;
      if (header !== segment) {
        lines.push(`## ${header}`);
        segment = header;
      }
      lines.push(`${row.label},${row.cells.join(',')}`);
      continue;
    }
    const stamp = intraday ? `${row.tradingDate} ${row.label}` : row.label;
    lines.push(`${stamp},${row.cells.join(',')}`);
  }

  return lines.join('\n');
}
