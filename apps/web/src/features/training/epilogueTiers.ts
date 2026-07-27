import type { TrainerViewPeriod } from '@kansoku/pro-api';
import type { RawBar } from '@kansoku/shared/types';

const NEW_YORK_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const BUCKET_MINUTES: Record<Exclude<TrainerViewPeriod, 'day' | 'week'>, number> = {
  '1m': 1,
  '5m': 5,
  '15m': 15,
  '30m': 30,
  '1h': 60,
};

function marketDate(time: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(time)) return time;
  return NEW_YORK_DATE.format(new Date(time));
}

// A US session opens on the half hour under both daylight-saving regimes (13:30Z in summer,
// 14:30Z in winter), so the boundaries have to be counted from :30 rather than from the UTC hour —
// otherwise every intraday bucket splits an hour of the session across two bars.
function intradayBucketStart(minutes: number, time: string): string {
  const at = new Date(time);
  const sinceUtcMidnight = at.getUTCHours() * 60 + at.getUTCMinutes();
  const index = Math.floor((sinceUtcMidnight - 30) / minutes);
  const start = new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), 0, index * minutes + 30),
  );
  return start.toISOString().replace('.000Z', 'Z');
}

function weekBucketStart(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  const weekday = value.getUTCDay();
  value.setUTCDate(value.getUTCDate() + (weekday === 0 ? -6 : 1 - weekday));
  return value.toISOString().slice(0, 10);
}

export function periodBucketStart(period: TrainerViewPeriod, time: string): string {
  if (period === 'day') return marketDate(time);
  if (period === 'week') return weekBucketStart(marketDate(time));
  return intradayBucketStart(BUCKET_MINUTES[period], time);
}

function numberOf(value: string | number): number {
  return typeof value === 'number' ? value : Number(value);
}

function aggregate(time: string, bars: readonly RawBar[]): RawBar {
  return {
    time,
    open: numberOf(bars[0].open),
    high: Math.max(...bars.map((bar) => numberOf(bar.high))),
    low: Math.min(...bars.map((bar) => numberOf(bar.low))),
    close: numberOf(bars[bars.length - 1].close),
    volume: bars.reduce((sum, bar) => sum + numberOf(bar.volume), 0),
  };
}

function absorb(open: RawBar, tail: RawBar): RawBar {
  return {
    time: open.time,
    open: numberOf(open.open),
    high: Math.max(numberOf(open.high), numberOf(tail.high)),
    low: Math.min(numberOf(open.low), numberOf(tail.low)),
    close: numberOf(tail.close),
    volume: numberOf(open.volume) + numberOf(tail.volume),
  };
}

export function extendTierWithEpilogue(
  period: TrainerViewPeriod,
  tier: readonly RawBar[],
  epilogue: readonly RawBar[],
): RawBar[] {
  if (epilogue.length === 0) return [...tier];
  const groups = new Map<string, RawBar[]>();
  for (const bar of epilogue) {
    const start = periodBucketStart(period, bar.time);
    const group = groups.get(start);
    if (group) group.push(bar);
    else groups.set(start, [bar]);
  }
  // A session can stop part-way through a mid/top bucket, and the tier already carries that bucket
  // as a bar built from the bars played so far. Keying by bucket start lets the epilogue continue
  // that bar rather than open a second one on the same timestamp, which lightweight-charts rejects.
  const byBucket = new Map<string, RawBar>();
  for (const bar of tier) byBucket.set(periodBucketStart(period, bar.time), bar);
  for (const [start, bars] of groups) {
    const open = byBucket.get(start);
    const rolled = aggregate(start, bars);
    byBucket.set(start, open ? absorb(open, rolled) : rolled);
  }
  return [...byBucket.values()].sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
}
