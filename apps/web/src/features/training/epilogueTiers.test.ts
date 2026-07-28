import { describe, expect, it } from 'vitest';
import type { RawBar } from '@kansoku/shared/types';
import { extendTierWithEpilogue, periodBucketStart } from './epilogueTiers';

function bar(time: string, close: number): RawBar {
  return { time, open: close - 1, high: close + 1, low: close - 1.5, close, volume: 1000 + close };
}

describe('periodBucketStart', () => {
  // 09:30 ET is 13:30Z in summer and 14:30Z in winter. Counting hours from UTC midnight instead
  // would put the first hour of every session in a bucket that starts before the open.
  it('aligns intraday buckets to the session open under both daylight-saving regimes', () => {
    expect(periodBucketStart('1h', '2026-07-06T14:00:00.000Z')).toBe('2026-07-06T13:30:00Z');
    expect(periodBucketStart('1h', '2026-07-06T14:29:00.000Z')).toBe('2026-07-06T13:30:00Z');
    expect(periodBucketStart('1h', '2026-07-06T14:30:00.000Z')).toBe('2026-07-06T14:30:00Z');
    expect(periodBucketStart('1h', '2026-01-06T15:00:00.000Z')).toBe('2026-01-06T14:30:00Z');
  });

  it('splits 15m and 5m on their own boundaries', () => {
    expect(periodBucketStart('15m', '2026-01-05T14:25:00.000Z')).toBe('2026-01-05T14:15:00Z');
    expect(periodBucketStart('15m', '2026-01-05T14:30:00.000Z')).toBe('2026-01-05T14:30:00Z');
    expect(periodBucketStart('5m', '2026-01-05T14:07:00.000Z')).toBe('2026-01-05T14:05:00Z');
  });

  it('buckets a day by its New York date, not by its UTC date', () => {
    expect(periodBucketStart('day', '2026-01-06T00:30:00.000Z')).toBe('2026-01-05');
    expect(periodBucketStart('day', '2026-01-06T15:00:00.000Z')).toBe('2026-01-06');
    expect(periodBucketStart('day', '2026-01-06')).toBe('2026-01-06');
  });

  it('buckets a week onto its Monday', () => {
    expect(periodBucketStart('week', '2026-01-08T15:00:00.000Z')).toBe('2026-01-05');
    expect(periodBucketStart('week', '2026-01-05')).toBe('2026-01-05');
  });
});

describe('extendTierWithEpilogue', () => {
  // The tier stops mid-bucket: 14:15Z holds only the two bars that were played before the case
  // ended, and the epilogue's first bar belongs to that same 15m window.
  const TIER: RawBar[] = [
    { time: '2026-01-05T14:00:00Z', open: 99, high: 103, low: 98.5, close: 102, volume: 3303 },
    { time: '2026-01-05T14:15:00Z', open: 102, high: 105, low: 101.5, close: 104, volume: 2207 },
  ];
  const EPILOGUE: RawBar[] = [
    bar('2026-01-05T14:25:00.000Z', 105),
    bar('2026-01-05T14:30:00.000Z', 106),
  ];

  it('continues the unfinished bucket and opens a bar for the next one', () => {
    expect(extendTierWithEpilogue('15m', TIER, EPILOGUE)).toEqual([
      TIER[0],
      { time: '2026-01-05T14:15:00Z', open: 102, high: 106, low: 101.5, close: 105, volume: 3312 },
      { time: '2026-01-05T14:30:00Z', open: 105, high: 107, low: 104.5, close: 106, volume: 1106 },
    ]);
  });

  it('rolls the same epilogue into the wider buckets of the top tier', () => {
    const top: RawBar[] = [
      { time: '2026-01-05T13:30:00Z', open: 99, high: 105, low: 98.5, close: 104, volume: 5510 },
    ];
    expect(extendTierWithEpilogue('1h', top, EPILOGUE)).toEqual([
      { time: '2026-01-05T13:30:00Z', open: 99, high: 106, low: 98.5, close: 105, volume: 6615 },
      { time: '2026-01-05T14:30:00Z', open: 105, high: 107, low: 104.5, close: 106, volume: 1106 },
    ]);
  });

  it('returns the tier unchanged for an empty epilogue', () => {
    const out = extendTierWithEpilogue('15m', TIER, []);
    expect(out).toEqual(TIER);
    expect(out).not.toBe(TIER);
  });

  it('keeps the result ascending by time', () => {
    const out = extendTierWithEpilogue('15m', TIER, EPILOGUE);
    const times = out.map((b) => Date.parse(b.time));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(new Set(times).size).toBe(times.length);
  });
});
