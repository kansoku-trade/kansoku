import { runLongbridgeJson } from '../../../core/src/marketdata/longbridgeCli.js';
import type { QuoteBar } from './assemble.js';

export type KlinePeriod = 'day' | 'week';
export type EpisodeKlinePeriod = KlinePeriod | '1h';

export type FetchKlineHistory = (
  symbol: string,
  period: KlinePeriod,
  start: string,
  end: string,
) => Promise<QuoteBar[]>;

interface RawKlineRow {
  time: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  turnover?: string;
}

export const fetchKlineHistoryLive = async (
  symbol: string,
  period: EpisodeKlinePeriod,
  start: string,
  end: string,
) => {
  const rows = await runLongbridgeJson<RawKlineRow[]>([
    'kline',
    'history',
    symbol,
    '--period',
    period,
    '--start',
    start,
    '--end',
    end,
    '--adjust',
    'forward',
  ]);
  return rows
    .map((row) => ({
      time: row.time,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
      turnover: row.turnover,
    }))
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
};

export interface CalendarEvent {
  date: string;
  content: string;
}

export type FetchCalendar = (
  symbol: string,
  start: string,
  end: string,
) => Promise<CalendarEvent[]>;

interface CalendarReportRow {
  date: string;
  infos?: { content?: string }[];
}

export const fetchCalendarLive: FetchCalendar = async (symbol, start, end) => {
  const res = await runLongbridgeJson<{ list?: CalendarReportRow[] }>([
    'finance-calendar',
    'report',
    '--symbol',
    symbol,
    '--start',
    start,
    '--end',
    end,
  ]);
  const list = res.list ?? [];
  return list.flatMap((row) =>
    (row.infos ?? []).map((info) => ({ date: row.date, content: info.content ?? '' })),
  );
};
