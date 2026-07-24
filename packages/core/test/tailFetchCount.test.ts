import { describe, expect, it } from 'vitest';
import { tailFetchCount } from '../src/realtime/charts.js';

const M5 = 5 * 60_000;

describe('tailFetchCount', () => {
  it('returns only the margin right after a fetch', () => {
    const now = 1_000_000_000;
    expect(tailFetchCount(now, now)).toBe(5);
  });

  it('grows with elapsed time at m5 granularity', () => {
    const now = 1_000_000_000;
    expect(tailFetchCount(now - 30 * 60_000, now)).toBe(6 + 5);
    expect(tailFetchCount(now - 4 * 60 * 60_000, now)).toBe(48 + 5);
  });

  it('caps at the full fetch count after long idling', () => {
    const now = 1_000_000_000;
    expect(tailFetchCount(0, now)).toBe(1000);
    expect(tailFetchCount(now - 1000 * M5, now)).toBe(1000);
  });

  it('respects an enlarged full count for history views', () => {
    const now = 1_000_000_000;
    expect(tailFetchCount(0, now, 2000)).toBe(2000);
    expect(tailFetchCount(now, now, 2000)).toBe(5);
  });
});
