import { describe, expect, it } from 'vitest';
import { marketDate, weekKey } from '../../src/episode/generate.js';
import {
  EPISODE_PERIOD_LADDER,
  type EpisodeBasePeriod,
  episodePeriodLadder,
  isEpisodeViewPeriod,
  periodBucketKey,
} from '../../src/episode/periods.js';

const GRANULARITY_ORDER = ['1m', '5m', '15m', '30m', '1h', 'day', 'week'];

function granularityIndex(period: string): number {
  return GRANULARITY_ORDER.indexOf(period);
}

const BASE_PERIODS: EpisodeBasePeriod[] = ['1m', '5m', '15m', '30m', '1h'];

describe('EPISODE_PERIOD_LADDER', () => {
  it('gives every base period exactly three tiers, strictly increasing in granularity, starting with itself', () => {
    for (const base of BASE_PERIODS) {
      const tiers = episodePeriodLadder(base);
      expect(tiers).toHaveLength(3);
      expect(tiers[0]).toBe(base);
      expect(granularityIndex(tiers[0])).toBeLessThan(granularityIndex(tiers[1]));
      expect(granularityIndex(tiers[1])).toBeLessThan(granularityIndex(tiers[2]));
    }
  });

  it('reproduces the existing 1h/day/week structure exactly', () => {
    expect(EPISODE_PERIOD_LADDER['1h']).toEqual(['1h', 'day', 'week']);
  });

  it('reports validity of a view period against a base period', () => {
    expect(isEpisodeViewPeriod('1h', 'week')).toBe(true);
    expect(isEpisodeViewPeriod('1h', '5m')).toBe(false);
    expect(isEpisodeViewPeriod('5m', '1h')).toBe(true);
    expect(isEpisodeViewPeriod('5m', 'day')).toBe(false);
  });
});

describe('periodBucketKey', () => {
  it('groups 5m-spaced timestamps inside the same 15m window and separates adjacent windows', () => {
    const first = periodBucketKey('15m', '2026-03-25T13:30:00Z');
    const second = periodBucketKey('15m', '2026-03-25T13:35:00Z');
    const third = periodBucketKey('15m', '2026-03-25T13:40:00Z');
    const nextWindow = periodBucketKey('15m', '2026-03-25T13:45:00Z');

    expect(first).toBe(second);
    expect(second).toBe(third);
    expect(first).not.toBe(nextWindow);
  });

  it('never shares a bucket key across a session boundary, for every intraday period', () => {
    const lastBarOfDay = '2026-03-25T19:59:00Z';
    const firstBarOfNextDay = '2026-03-26T13:30:00Z';

    for (const period of BASE_PERIODS) {
      const lastKey = periodBucketKey(period, lastBarOfDay);
      const firstKey = periodBucketKey(period, firstBarOfNextDay);
      expect(lastKey).not.toBe(firstKey);
    }
  });

  it('aligns 1h buckets to the half-hour open under EDT (13:30Z)', () => {
    const open = periodBucketKey('1h', '2026-03-25T13:30:00Z');
    const sameBucket30m = periodBucketKey('1h', '2026-03-25T14:00:00Z');
    const nextBucket30m = periodBucketKey('1h', '2026-03-25T14:30:00Z');
    const sameBucket5m = periodBucketKey('1h', '2026-03-25T14:25:00Z');
    const nextBucket5m = periodBucketKey('1h', '2026-03-25T14:30:00Z');

    expect(open).toBe(sameBucket30m);
    expect(open).not.toBe(nextBucket30m);
    expect(open).toBe(sameBucket5m);
    expect(open).not.toBe(nextBucket5m);
  });

  it('aligns 1h buckets to the half-hour open under EST (14:30Z)', () => {
    const open = periodBucketKey('1h', '2026-01-15T14:30:00Z');
    const sameBucket30m = periodBucketKey('1h', '2026-01-15T15:00:00Z');
    const nextBucket30m = periodBucketKey('1h', '2026-01-15T15:30:00Z');
    const sameBucket5m = periodBucketKey('1h', '2026-01-15T15:25:00Z');
    const nextBucket5m = periodBucketKey('1h', '2026-01-15T15:30:00Z');

    expect(open).toBe(sameBucket30m);
    expect(open).not.toBe(nextBucket30m);
    expect(open).toBe(sameBucket5m);
    expect(open).not.toBe(nextBucket5m);
  });

  it('agrees with marketDate for the day period', () => {
    const time = '2026-03-25T15:00:00Z';
    expect(periodBucketKey('day', time)).toBe(marketDate(time));
  });

  it('agrees with weekKey for the week period', () => {
    const time = '2026-03-25T15:00:00Z';
    expect(periodBucketKey('week', time)).toBe(weekKey(marketDate(time)));
  });
});
