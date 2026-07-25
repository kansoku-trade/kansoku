import { describe, expect, it } from 'vitest';
import type { QuoteBar } from '../../src/generate/assemble.js';
import {
  EPISODE_REQUIRED_BASE,
  EPISODE_REQUIRED_DAY,
  EPISODE_REQUIRED_H1,
  EPISODE_REQUIRED_MID,
  EPISODE_REQUIRED_TOP,
  EPISODE_REQUIRED_WEEK,
  assembleEpisodeQuestion,
  generateEpisodeCase,
  marketCloseIso,
} from '../../src/episode/generate.js';
import { periodBucketStart } from '../../src/episode/periods.js';
import { Value } from 'typebox/value';
import { questionSchema } from '../../src/schema/question.js';

function dateOffset(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function bar(time: string, index: number): QuoteBar {
  const close = 100 + index / 10;
  return {
    time,
    open: String(close - 0.2),
    high: String(close + 0.5),
    low: String(close - 0.5),
    close: String(close),
    volume: String(1_000_000 + index),
    turnover: String((1_000_000 + index) * close),
  };
}

function businessDates(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let cursor = start; cursor <= end; cursor = dateOffset(cursor, 1)) {
    const day = new Date(`${cursor}T12:00:00Z`).getUTCDay();
    if (day !== 0 && day !== 6) dates.push(cursor);
  }
  return dates;
}

function hourBarsForCutoff(cutoff: string, futureSessions: number): QuoteBar[] {
  const dates = businessDates(dateOffset(cutoff, -60), dateOffset(cutoff, 20));
  const initial = dates.filter((date) => date <= cutoff).slice(-30);
  const future = dates.filter((date) => date > cutoff).slice(0, futureSessions);
  return [...initial, ...future].flatMap((date, dateIndex) =>
    Array.from({ length: 7 }, (_, hourIndex) => {
      const hour = String(9 + hourIndex).padStart(2, '0');
      const minute = hourIndex === 0 ? '30' : '30';
      return bar(`${date}T${hour}:${minute}:00-04:00`, dateIndex * 7 + hourIndex);
    }),
  );
}

function dailyBars(cutoff: string): QuoteBar[] {
  return businessDates(dateOffset(cutoff, -500), dateOffset(cutoff, 20)).map((date, index) =>
    bar(`${date}T20:00:00Z`, index),
  );
}

function weeklyBars(cutoff: string): QuoteBar[] {
  return Array.from({ length: 120 }, (_, index) =>
    bar(`${dateOffset(cutoff, (index - 120) * 7)}T20:00:00Z`, index),
  );
}

function timeAt(date: string, minutesSinceMidnight: number): string {
  const hour = Math.floor(minutesSinceMidnight / 60);
  const minute = minutesSinceMidnight % 60;
  return `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-04:00`;
}

function sessionBars(date: string, minutes: number, startIndex: number): QuoteBar[] {
  const count = Math.ceil(390 / minutes);
  return Array.from({ length: count }, (_, i) => bar(timeAt(date, 570 + i * minutes), startIndex + i));
}

function intradayBarsForDates(dates: string[], minutes: number): QuoteBar[] {
  let index = 0;
  return dates.flatMap((date) => {
    const bars = sessionBars(date, minutes, index);
    index += bars.length;
    return bars;
  });
}

describe('assembleEpisodeQuestion', () => {
  it('builds a schema-valid 1h/day/week case with a session-based replay horizon', () => {
    const cutoffDate = '2026-03-25';
    const days = dailyBars(cutoffDate);
    const poisonedCurrentWeek = bar('2026-03-23T20:00:00Z', 9_999);
    const question = assembleEpisodeQuestion({
      symbol: 'MU.US',
      layer: 'high-vol-tech',
      cutoffDate,
      hourBars: hourBarsForCutoff(cutoffDate, 4),
      dayBars: days,
      weekBars: [...weeklyBars(cutoffDate), poisonedCurrentWeek],
      horizonSessions: 4,
      calendar: {},
    });

    expect(Value.Check(questionSchema, question)).toBe(true);
    expect(question.fixtures.kline['1h']).toHaveLength(EPISODE_REQUIRED_H1);
    expect(question.fixtures.kline.day).toHaveLength(EPISODE_REQUIRED_DAY);
    expect(question.fixtures.kline.week).toHaveLength(EPISODE_REQUIRED_WEEK);
    const cutoffDay = days.find((value) => value.time.startsWith(cutoffDate))!;
    expect(question.fixtures.kline.week.at(-1)).toMatchObject({
      time: '2026-03-23',
      close: Number(cutoffDay.close),
    });
    expect(question.replay.basePeriod).toBe('1h');
    expect(question.replay.horizonSessions).toBe(4);
    expect(question.replay.horizonBars).toBe(28);
    expect(question.replay.decisionExpiryBars).toBeUndefined();
    expect(question.replay.entryExpiryBars).toBe(21);
    expect(question.replay.bars).toHaveLength(28);
    expect(question.replay.rollups?.day).toHaveLength(4);
    expect(question.replay.rollups?.week).toHaveLength(1);
    expect(question.replay.rollups?.week[0].bar.close).toBe(poisonedCurrentWeek.close);
    expect(
      question.fixtures.kline['1h'].every(
        (value) => Date.parse(value.time) < Date.parse(question.cutoff),
      ),
    ).toBe(true);
  });

  it('uses the correct New York close offset across daylight-saving time', () => {
    expect(marketCloseIso('2026-01-02')).toBe('2026-01-02T16:00:00-05:00');
    expect(marketCloseIso('2026-06-15')).toBe('2026-06-15T16:00:00-04:00');
  });

  it('rejects a replay that does not cover the requested number of sessions', () => {
    const cutoffDate = '2026-03-25';
    expect(() =>
      assembleEpisodeQuestion({
        symbol: 'MU.US',
        layer: 'high-vol-tech',
        cutoffDate,
        hourBars: hourBarsForCutoff(cutoffDate, 2),
        dayBars: dailyBars(cutoffDate),
        weekBars: weeklyBars(cutoffDate),
        horizonSessions: 4,
      }),
    ).toThrow('insufficient replay sessions');
  });

  it('assembles a 5m-base case with the 5m/15m/1h ladder populated and rollups emitted', () => {
    const cutoffDate = '2026-03-25';
    const pastDates = businessDates(dateOffset(cutoffDate, -60), cutoffDate);
    const futureDates = businessDates(dateOffset(cutoffDate, 1), dateOffset(cutoffDate, 20)).slice(0, 4);
    const allDates = [...pastDates, ...futureDates];

    const question = assembleEpisodeQuestion({
      symbol: 'MRVL.US',
      layer: 'high-vol-tech',
      cutoffDate,
      basePeriod: '5m',
      baseBars: intradayBarsForDates(allDates, 5),
      midBars: intradayBarsForDates(allDates, 15),
      topBars: intradayBarsForDates(allDates, 60),
      horizonSessions: 4,
      calendar: {},
    });

    expect(Value.Check(questionSchema, question)).toBe(true);
    expect(question.replay.basePeriod).toBe('5m');
    expect(question.fixtures.kline['5m']).toHaveLength(EPISODE_REQUIRED_BASE);
    expect(question.fixtures.kline['15m']).toHaveLength(EPISODE_REQUIRED_MID);
    expect(question.fixtures.kline['1h']).toHaveLength(EPISODE_REQUIRED_TOP);
    expect(question.replay.horizonSessions).toBe(4);
    expect(question.replay.rollups?.['15m']?.length).toBeGreaterThan(0);
    expect(question.replay.rollups?.['1h']?.length).toBeGreaterThan(0);
  });

  it('takes exactly the requested horizonBars on the bars-based path', () => {
    const cutoffDate = '2026-03-25';
    const question = assembleEpisodeQuestion({
      symbol: 'MU.US',
      layer: 'high-vol-tech',
      cutoffDate,
      hourBars: hourBarsForCutoff(cutoffDate, 4),
      dayBars: dailyBars(cutoffDate),
      weekBars: weeklyBars(cutoffDate),
      horizonBars: 10,
      calendar: {},
    });

    expect(Value.Check(questionSchema, question)).toBe(true);
    expect(question.replay.horizonBars).toBe(10);
    expect(question.replay.bars).toHaveLength(10);
    expect(question.replay.horizonSessions).toBeUndefined();
    expect(question.replay.entryExpiryBars).toBe(1);
    expect(question.replay.entryExpiryBars!).toBeLessThan(question.replay.horizonBars);
  });

  it('bounds entryExpiryBars by horizonBars for a 1m-base episode', () => {
    const cutoffDate = '2026-03-25';
    const pastDates = businessDates(dateOffset(cutoffDate, -20), cutoffDate);
    const futureDates = businessDates(dateOffset(cutoffDate, 1), dateOffset(cutoffDate, 20)).slice(0, 1);
    const allDates = [...pastDates, ...futureDates];

    const question = assembleEpisodeQuestion({
      symbol: 'MRVL.US',
      layer: 'high-vol-tech',
      cutoffDate,
      basePeriod: '1m',
      baseBars: intradayBarsForDates(allDates, 1),
      midBars: intradayBarsForDates(allDates, 5),
      topBars: intradayBarsForDates(allDates, 15),
      horizonBars: 180,
      calendar: {},
    });

    expect(Value.Check(questionSchema, question)).toBe(true);
    expect(question.replay.horizonBars).toBe(180);
    expect(question.replay.entryExpiryBars).toBe(14);
    expect(question.replay.entryExpiryBars!).toBeLessThan(question.replay.horizonBars);
  });

  it('rejects a bars-based horizon that the source data cannot cover', () => {
    const cutoffDate = '2026-03-25';
    expect(() =>
      assembleEpisodeQuestion({
        symbol: 'MU.US',
        layer: 'high-vol-tech',
        cutoffDate,
        hourBars: hourBarsForCutoff(cutoffDate, 1),
        dayBars: dailyBars(cutoffDate),
        weekBars: weeklyBars(cutoffDate),
        horizonBars: 50,
      }),
    ).toThrow('insufficient replay bars');
  });

  it('emits mid and top rollups keyed by the ladder tiers, with availableAt at the last base bar of the bucket', () => {
    const cutoffDate = '2026-03-25';
    const pastDates = businessDates(dateOffset(cutoffDate, -60), cutoffDate);
    const futureDates = businessDates(dateOffset(cutoffDate, 1), dateOffset(cutoffDate, 20)).slice(0, 1);
    const allDates = [...pastDates, ...futureDates];
    const futureDate = futureDates[0];

    const midBars = intradayBarsForDates(allDates, 15);
    const topBars = intradayBarsForDates(allDates, 60);

    const question = assembleEpisodeQuestion({
      symbol: 'MRVL.US',
      layer: 'high-vol-tech',
      cutoffDate,
      basePeriod: '5m',
      baseBars: intradayBarsForDates(allDates, 5),
      midBars,
      topBars,
      horizonSessions: 1,
      calendar: {},
    });

    const firstMidRollup = question.replay.rollups!['15m'][0];
    expect(firstMidRollup.availableAt).toBe(timeAt(futureDate, 570 + 2 * 5));
    const nativeMidBar = midBars.find((entry) => entry.time === timeAt(futureDate, 570));
    expect(firstMidRollup.bar.close).toBe(nativeMidBar!.close);

    const firstTopRollup = question.replay.rollups!['1h'][0];
    expect(firstTopRollup.availableAt).toBe(timeAt(futureDate, 570 + 11 * 5));
    const nativeTopBar = topBars.find((entry) => entry.time === timeAt(futureDate, 570));
    expect(firstTopRollup.bar.close).toBe(nativeTopBar!.close);
  });

  it('withholds a mid rollup for a bucket the bars-based horizon only partially revealed', () => {
    const cutoffDate = '2026-03-25';
    const pastDates = businessDates(dateOffset(cutoffDate, -60), cutoffDate);
    const futureDates = businessDates(dateOffset(cutoffDate, 1), dateOffset(cutoffDate, 20)).slice(0, 1);
    const allDates = [...pastDates, ...futureDates];
    const futureDate = futureDates[0];

    const midBars = intradayBarsForDates(allDates, 15);
    const topBars = intradayBarsForDates(allDates, 60);

    const question = assembleEpisodeQuestion({
      symbol: 'MRVL.US',
      layer: 'high-vol-tech',
      cutoffDate,
      basePeriod: '5m',
      baseBars: intradayBarsForDates(allDates, 5),
      midBars,
      topBars,
      horizonBars: 4,
      calendar: {},
    });

    expect(question.replay.bars).toHaveLength(4);
    expect(question.replay.rollups!['15m']).toHaveLength(1);
    expect(question.replay.rollups!['15m'][0].availableAt).toBe(timeAt(futureDate, 570 + 2 * 5));
    const secondBucketNativeBar = midBars.find((entry) => entry.time === timeAt(futureDate, 570 + 3 * 5));
    expect(
      question.replay.rollups!['15m'].some((entry) => entry.bar.close === secondBucketNativeBar!.close),
    ).toBe(false);
    expect(question.replay.rollups!['1h']).toHaveLength(0);
  });

  it('folds a mid-bucket cutoff into a single partial bar covering the whole elapsed part of the bucket', () => {
    const cutoffDate = '2026-03-25';
    const pastDates = businessDates(dateOffset(cutoffDate, -90), cutoffDate);
    const futureDates = businessDates(dateOffset(cutoffDate, 1), dateOffset(cutoffDate, 20)).slice(0, 1);
    const allDates = [...pastDates, ...futureDates];

    const baseBars = intradayBarsForDates(allDates, 15);

    const question = assembleEpisodeQuestion({
      symbol: 'MRVL.US',
      layer: 'high-vol-tech',
      cutoffDate,
      basePeriod: '15m',
      baseBars,
      midBars: intradayBarsForDates(allDates, 60),
      topBars: dailyBars(cutoffDate),
      horizonSessions: 1,
      calendar: {},
    });

    const cutoffIso = marketCloseIso(cutoffDate);
    const expectedBucketStart = periodBucketStart('1h', cutoffIso);
    const bucketBaseBars = baseBars.filter(
      (b) => b.time === timeAt(cutoffDate, 15 * 60 + 30) || b.time === timeAt(cutoffDate, 15 * 60 + 45),
    );
    expect(bucketBaseBars).toHaveLength(2);

    const lastMidBar = question.fixtures.kline['1h'].at(-1)!;
    expect(Date.parse(lastMidBar.time)).toBe(Date.parse(expectedBucketStart));
    expect(Number(lastMidBar.open)).toBe(Number(bucketBaseBars[0].open));
    expect(Number(lastMidBar.close)).toBe(Number(bucketBaseBars[1].close));
    expect(Number(lastMidBar.high)).toBe(Math.max(...bucketBaseBars.map((b) => Number(b.high))));
    expect(Number(lastMidBar.low)).toBe(Math.min(...bucketBaseBars.map((b) => Number(b.low))));
    expect(Number(lastMidBar.volume)).toBe(
      bucketBaseBars.reduce((sum, b) => sum + Number(b.volume), 0),
    );
  });

  it('rejects a 5m-base case with insufficient mid-tier (15m) history, naming the tier', () => {
    const cutoffDate = '2026-03-25';
    const pastDates = businessDates(dateOffset(cutoffDate, -60), cutoffDate);
    const futureDates = businessDates(dateOffset(cutoffDate, 1), dateOffset(cutoffDate, 20)).slice(0, 4);
    const allDates = [...pastDates, ...futureDates];

    expect(() =>
      assembleEpisodeQuestion({
        symbol: 'MRVL.US',
        layer: 'high-vol-tech',
        cutoffDate,
        basePeriod: '5m',
        baseBars: intradayBarsForDates(allDates, 5),
        midBars: intradayBarsForDates(pastDates.slice(-3), 15),
        topBars: intradayBarsForDates(allDates, 60),
        horizonSessions: 4,
      }),
    ).toThrow('insufficient 15m history');
  });
});

describe('generateEpisodeCase', () => {
  it('rejects a non-1h base before ever calling the injected fetcher', async () => {
    const fetchKlineHistory = async (): Promise<QuoteBar[]> => {
      throw new Error('fetchKlineHistory should not be called');
    };

    await expect(
      generateEpisodeCase({
        symbol: 'MRVL.US',
        layer: 'high-vol-tech',
        cutoffDate: '2026-03-25',
        version: 'v-test',
        basePeriod: '5m',
        datasetsRoot: '/does-not-matter',
        fetchKlineHistory,
      }),
    ).rejects.toThrow('cannot fetch 5m kline');
  });
});
