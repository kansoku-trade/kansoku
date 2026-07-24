import { describe, expect, it } from 'vitest';
import type { RawBar, TimeframeKey } from '@kansoku/shared/types';
import { createDb } from '../src/db/index.js';
import { loadCandleCache, saveCandleCache } from '../src/realtime/candleCache.js';

function bars(n: number): RawBar[] {
  return Array.from({ length: n }, (_, i) => ({
    time: new Date(1_753_000_000_000 + i * 300_000).toISOString(),
    open: 1,
    high: 2,
    low: 0.5,
    close: 1.5,
    volume: 100,
  }));
}

function fullTimeframes(): Partial<Record<TimeframeKey, RawBar[]>> {
  return { m5: bars(60), m15: bars(60), h1: bars(60) };
}

describe('candleCache', () => {
  it('round-trips timeframes, day kline and lastFetchAt', () => {
    const db = createDb(':memory:');
    const data = { timeframes: fullTimeframes(), dayKline: bars(10), lastFetchAt: 12345 };
    saveCandleCache('SNDK.US', data, db);
    const loaded = loadCandleCache('SNDK.US', db);
    expect(loaded).not.toBeNull();
    expect(loaded!.lastFetchAt).toBe(12345);
    expect(loaded!.timeframes.m5).toHaveLength(60);
    expect(loaded!.dayKline).toHaveLength(10);
  });

  it('returns null for missing symbols', () => {
    const db = createDb(':memory:');
    expect(loadCandleCache('NOPE.US', db)).toBeNull();
  });

  it('rejects rows with missing or thin timeframes', () => {
    const db = createDb(':memory:');
    saveCandleCache(
      'THIN.US',
      { timeframes: { m5: bars(10), m15: bars(60), h1: bars(60) }, dayKline: null, lastFetchAt: 1 },
      db,
    );
    expect(loadCandleCache('THIN.US', db)).toBeNull();

    saveCandleCache(
      'PART.US',
      { timeframes: { m5: bars(60), m15: bars(60) }, dayKline: null, lastFetchAt: 1 },
      db,
    );
    expect(loadCandleCache('PART.US', db)).toBeNull();
  });

  it('upserts on repeated saves', () => {
    const db = createDb(':memory:');
    const data = { timeframes: fullTimeframes(), dayKline: null, lastFetchAt: 1 };
    saveCandleCache('MU.US', data, db);
    saveCandleCache('MU.US', { ...data, lastFetchAt: 2 }, db);
    expect(loadCandleCache('MU.US', db)!.lastFetchAt).toBe(2);
  });
});
