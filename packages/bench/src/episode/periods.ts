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

function intradayBucketIndex(period: EpisodeBasePeriod, isoTime: string): number {
  const minutes = EPISODE_INTRADAY_MINUTES[period];
  const time = new Date(isoTime);
  const minutesSinceUtcMidnight = time.getUTCHours() * 60 + time.getUTCMinutes();
  // Sessions open on the half hour (13:30Z EDT / 14:30Z EST); subtract 30 before
  // dividing so bucket boundaries stay aligned to the open under both DST regimes.
  return Math.floor((minutesSinceUtcMidnight - 30) / minutes);
}

export function periodBucketKey(period: EpisodeViewPeriod, isoTime: string): string {
  if (period === 'week') return weekKey(marketDate(isoTime));
  if (period === 'day') return marketDate(isoTime);
  return `${marketDate(isoTime)}:${intradayBucketIndex(period, isoTime)}`;
}

export function periodBucketStart(period: EpisodeViewPeriod, isoTime: string): string {
  if (period === 'week') return weekKey(marketDate(isoTime));
  if (period === 'day') return marketDate(isoTime);
  const minutes = EPISODE_INTRADAY_MINUTES[period];
  const bucketIndex = intradayBucketIndex(period, isoTime);
  const time = new Date(isoTime);
  const start = new Date(
    Date.UTC(
      time.getUTCFullYear(),
      time.getUTCMonth(),
      time.getUTCDate(),
      0,
      bucketIndex * minutes + 30,
    ),
  );
  return start.toISOString().replace('.000Z', 'Z');
}
