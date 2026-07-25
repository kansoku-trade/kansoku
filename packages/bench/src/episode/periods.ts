import { marketDate, weekKey } from './generate.js';

export type EpisodeBasePeriod = '1m' | '5m' | '15m' | '30m' | '1h';
export type EpisodeViewPeriod = EpisodeBasePeriod | 'day' | 'week';

export type EpisodePeriodLadder = readonly [
  EpisodeViewPeriod,
  EpisodeViewPeriod,
  EpisodeViewPeriod,
];

export const EPISODE_PERIOD_LADDER: Readonly<Record<EpisodeBasePeriod, EpisodePeriodLadder>> =
  Object.freeze({
    '1m': ['1m', '5m', '15m'],
    '5m': ['5m', '15m', '1h'],
    '15m': ['15m', '1h', 'day'],
    '30m': ['30m', '1h', 'day'],
    '1h': ['1h', 'day', 'week'],
  });

export function episodePeriodLadder(basePeriod: EpisodeBasePeriod): EpisodePeriodLadder {
  return EPISODE_PERIOD_LADDER[basePeriod];
}

export function isEpisodeViewPeriod(
  basePeriod: EpisodeBasePeriod,
  viewPeriod: EpisodeViewPeriod,
): boolean {
  return EPISODE_PERIOD_LADDER[basePeriod].includes(viewPeriod);
}

export const EPISODE_INTRADAY_MINUTES: Readonly<Record<EpisodeBasePeriod, number>> =
  Object.freeze({
    '1m': 1,
    '5m': 5,
    '15m': 15,
    '30m': 30,
    '1h': 60,
  });

export function periodBucketKey(period: EpisodeViewPeriod, isoTime: string): string {
  if (period === 'week') return weekKey(marketDate(isoTime));
  if (period === 'day') return marketDate(isoTime);
  const minutes = EPISODE_INTRADAY_MINUTES[period];
  const time = new Date(isoTime);
  const minutesSinceUtcMidnight = time.getUTCHours() * 60 + time.getUTCMinutes();
  const bucketIndex = Math.floor(minutesSinceUtcMidnight / minutes);
  return `${marketDate(isoTime)}:${bucketIndex}`;
}
