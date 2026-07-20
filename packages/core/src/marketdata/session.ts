import type { OffSessionSegment, SessionKind } from '@kansoku/shared/types';
import type { Market } from '../symbols/symbol.utils.js';

interface MarketSessionConfig {
  timeZone: string;
  regularSegments: Array<[number, number]>;
  extended: boolean;
}

const PRE_START = 4 * 60;
const POST_END = 20 * 60;

const MARKET_CONFIG: Record<Market, MarketSessionConfig> = {
  US: {
    timeZone: 'America/New_York',
    regularSegments: [[9 * 60 + 30, 16 * 60]],
    extended: true,
  },
  HK: {
    timeZone: 'Asia/Hong_Kong',
    regularSegments: [
      [9 * 60 + 30, 12 * 60],
      [13 * 60, 16 * 60],
    ],
    extended: false,
  },
  CN: {
    timeZone: 'Asia/Shanghai',
    regularSegments: [
      [9 * 60 + 30, 11 * 60 + 30],
      [13 * 60, 15 * 60],
    ],
    extended: false,
  },
};

function buildClockFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildDateFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

const clockFormatters: Record<Market, Intl.DateTimeFormat> = {
  US: buildClockFormatter(MARKET_CONFIG.US.timeZone),
  HK: buildClockFormatter(MARKET_CONFIG.HK.timeZone),
  CN: buildClockFormatter(MARKET_CONFIG.CN.timeZone),
};

const dateFormatters: Record<Market, Intl.DateTimeFormat> = {
  US: buildDateFormatter(MARKET_CONFIG.US.timeZone),
  HK: buildDateFormatter(MARKET_CONFIG.HK.timeZone),
  CN: buildDateFormatter(MARKET_CONFIG.CN.timeZone),
};

export function marketDate(market: Market, date: Date = new Date()): string {
  return dateFormatters[market].format(date);
}

export function easternDate(date: Date = new Date()): string {
  return marketDate('US', date);
}

export function isCurrentSessionId(id: string, market: Market = 'US'): boolean {
  return id.slice(0, 10) === marketDate(market);
}

function readClockParts(
  market: Market,
  ts: number,
): { weekday: string; hour: number; minute: number } {
  const parts = clockFormatters[market].formatToParts(new Date(ts * 1000));
  let weekday = '';
  let hour = 0;
  let minute = 0;
  for (const p of parts) {
    if (p.type === 'weekday') weekday = p.value;
    else if (p.type === 'hour') hour = Number(p.value);
    else if (p.type === 'minute') minute = Number(p.value);
  }
  return { weekday, hour, minute };
}

export function marketMinuteOfDay(market: Market, ts: number): number {
  const { hour, minute } = readClockParts(market, ts);
  return (hour % 24) * 60 + minute;
}

export function easternMinuteOfDay(ts: number): number {
  return marketMinuteOfDay('US', ts);
}

function classifyByMinute(market: Market, min: number): SessionKind {
  const config = MARKET_CONFIG[market];
  for (const [start, end] of config.regularSegments) {
    if (min >= start && min < end) return 'regular';
  }
  if (config.extended) {
    const first = config.regularSegments[0][0];
    const last = config.regularSegments.at(-1)![1];
    if (min >= PRE_START && min < first) return 'pre';
    if (min >= last && min < POST_END) return 'post';
  }
  return 'overnight';
}

export function classifySession(ts: number, market: Market = 'US'): SessionKind {
  const { weekday, hour, minute } = readClockParts(market, ts);
  if (weekday === 'Sat' || weekday === 'Sun') return 'overnight';
  const min = (hour % 24) * 60 + minute;
  return classifyByMinute(market, min);
}

export function sessionLabel(kind: SessionKind, market: Market = 'US'): string {
  switch (kind) {
    case 'regular': {
      return '日盘';
    }
    case 'pre': {
      return '盘前';
    }
    case 'post': {
      return '盘后';
    }
    case 'overnight': {
      return market === 'US' ? '隔夜' : '休市';
    }
  }
}

export function offSessionSegments(timesTs: number[], market: Market = 'US'): OffSessionSegment[] {
  const out: OffSessionSegment[] = [];
  let cur: OffSessionSegment | null = null;
  for (const t of timesTs) {
    const kind = classifySession(t, market);
    if (kind === 'regular') {
      if (cur) {
        out.push(cur);
        cur = null;
      }
      continue;
    }
    if (cur && cur.kind === kind) {
      cur.endTime = t;
    } else {
      if (cur) out.push(cur);
      cur = { startTime: t, endTime: t, kind };
    }
  }
  if (cur) out.push(cur);
  return out;
}
