import { runLongbridgeJson } from '../../../core/src/marketdata/longbridgeCli.js';
import type { EpisodeViewPeriod } from '../episode/periods.js';
import type { QuoteBar } from './assemble.js';

export type KlinePeriod = 'day' | 'week';
export type EpisodeKlinePeriod = EpisodeViewPeriod;

export type FetchKlineHistory = (
  symbol: string,
  period: KlinePeriod,
  start: string,
  end: string,
) => Promise<QuoteBar[]>;

export type KlinePage = (start: string, end: string) => Promise<QuoteBar[]>;

export const KLINE_PAGE_CAP = 1000;

function barTimeMs(bar: QuoteBar): number {
  return Date.parse(bar.time);
}

function earliestBar(page: QuoteBar[]): QuoteBar {
  return page.reduce((earliest, bar) => (barTimeMs(bar) < barTimeMs(earliest) ? bar : earliest));
}

function dateOf(time: string): string {
  return time.slice(0, 10);
}

function mergeUniqueSorted(pages: QuoteBar[][]): QuoteBar[] {
  const byTime = new Map<string, QuoteBar>();
  for (const page of pages) {
    for (const bar of page) byTime.set(bar.time, bar);
  }
  return [...byTime.values()].sort((a, b) => barTimeMs(a) - barTimeMs(b));
}

export async function fetchKlineHistoryPaged(
  fetchPage: KlinePage,
  start: string,
  end: string,
): Promise<QuoteBar[]> {
  const pages: QuoteBar[][] = [];
  let windowEnd = end;
  let previousEarliestMs: number | undefined;

  for (;;) {
    const page = await fetchPage(start, windowEnd);
    if (page.length === 0) break;

    if (page.length < KLINE_PAGE_CAP) {
      pages.push(page);
      break;
    }

    const earliest = earliestBar(page);
    const earliestMs = barTimeMs(earliest);
    if (previousEarliestMs !== undefined && earliestMs >= previousEarliestMs) break;

    pages.push(page);
    previousEarliestMs = earliestMs;
    windowEnd = dateOf(earliest.time);
  }

  return mergeUniqueSorted(pages);
}

interface RawKlineRow {
  time: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  turnover?: string;
}

function buildKlinePage(symbol: string, period: EpisodeKlinePeriod): KlinePage {
  return async (start, end) => {
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
    return rows.map((row) => ({
      time: row.time,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
      turnover: row.turnover,
    }));
  };
}

export const fetchKlineHistoryLive = async (
  symbol: string,
  period: EpisodeKlinePeriod,
  start: string,
  end: string,
) => fetchKlineHistoryPaged(buildKlinePage(symbol, period), start, end);

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
