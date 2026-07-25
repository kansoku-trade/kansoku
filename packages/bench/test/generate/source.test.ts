import { describe, expect, it } from 'vitest';
import type { QuoteBar } from '../../src/generate/assemble.js';
import { KLINE_PAGE_CAP, fetchKlineHistoryPaged } from '../../src/generate/source.js';

function minuteBar(timeMs: number, seq: number): QuoteBar {
  const close = 100 + seq / 100;
  return {
    time: new Date(timeMs).toISOString(),
    open: `${close - 0.1}`,
    high: `${close + 0.1}`,
    low: `${close - 0.1}`,
    close: `${close}`,
    volume: `${1_000 + seq}`,
  };
}

function dateOf(time: string): string {
  return time.slice(0, 10);
}

function buildDayBars(dateIso: string, count: number, seqStart: number): QuoteBar[] {
  const dayStart = Date.parse(`${dateIso}T00:00:00.000Z`);
  return Array.from({ length: count }, (_, i) =>
    minuteBar(dayStart + i * 60_000, seqStart + i),
  );
}

function truncatingFakePage(allBars: QuoteBar[]) {
  return async (start: string, end: string): Promise<QuoteBar[]> => {
    const inRange = allBars.filter((bar) => {
      const barDate = dateOf(bar.time);
      return barDate >= start && barDate <= end;
    });
    return inRange.length <= KLINE_PAGE_CAP ? inRange : inRange.slice(-KLINE_PAGE_CAP);
  };
}

describe('fetchKlineHistoryPaged', () => {
  it('makes a single call and returns all bars sorted when under the cap', async () => {
    const bars = buildDayBars('2024-05-01', 5, 0);
    const shuffled = [bars[2], bars[0], bars[4], bars[1], bars[3]];
    const calls: Array<[string, string]> = [];
    const fetchPage = async (start: string, end: string) => {
      calls.push([start, end]);
      return shuffled;
    };

    const result = await fetchKlineHistoryPaged(fetchPage, '2024-05-01', '2024-05-01');

    expect(calls).toHaveLength(1);
    expect(result.map((bar) => bar.time)).toEqual(bars.map((bar) => bar.time));
  });

  it('walks backward page by page to cover a range wider than the cap', async () => {
    const barsPerDay = 600;
    const dates = ['2024-06-01', '2024-06-02', '2024-06-03', '2024-06-04'];
    const allBars = dates.flatMap((date, dayIndex) =>
      buildDayBars(date, barsPerDay, dayIndex * barsPerDay),
    );
    const fetchPage = truncatingFakePage(allBars);

    const result = await fetchKlineHistoryPaged(fetchPage, dates[0], dates[dates.length - 1]);

    expect(result.map((bar) => bar.time)).toEqual(allBars.map((bar) => bar.time));
    const times = result.map((bar) => Date.parse(bar.time));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(new Set(result.map((bar) => bar.time)).size).toBe(result.length);
  });

  it('de-duplicates bars shared across an overlapping page boundary', async () => {
    const dayOne = buildDayBars('2024-07-01', 700, 0);
    const dayTwo = buildDayBars('2024-07-02', 700, 700);
    const allBars = [...dayOne, ...dayTwo];
    const fetchPage = truncatingFakePage(allBars);

    const result = await fetchKlineHistoryPaged(fetchPage, '2024-07-01', '2024-07-02');

    expect(result).toHaveLength(allBars.length);
    expect(new Set(result.map((bar) => bar.time)).size).toBe(allBars.length);
    expect(result.map((bar) => bar.time)).toEqual(allBars.map((bar) => bar.time));
  });

  it('stops instead of looping forever when a page makes no backward progress', async () => {
    const stuckPage = buildDayBars('2024-08-01', KLINE_PAGE_CAP, 0);
    let calls = 0;
    const fetchPage = async () => {
      calls += 1;
      return stuckPage;
    };

    const result = await fetchKlineHistoryPaged(fetchPage, '2024-01-01', '2024-08-01');

    expect(calls).toBe(2);
    expect(result).toHaveLength(KLINE_PAGE_CAP);
    expect(new Set(result.map((bar) => bar.time)).size).toBe(KLINE_PAGE_CAP);
  });

  it('returns an empty array without erroring when no bars come back', async () => {
    const fetchPage = async () => [];

    const result = await fetchKlineHistoryPaged(fetchPage, '2024-01-01', '2024-01-02');

    expect(result).toEqual([]);
  });
});
