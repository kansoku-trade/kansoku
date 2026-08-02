import { describe, expect, it } from 'vitest';
import type { TrainerView } from '@kansoku/pro-api';
import type { RawBar } from '@kansoku/shared/types';
import { remainingBarsAt } from './remainingBars';

// A US session opens at 14:30Z in winter, which is where epilogueTiers counts its buckets from.
function fiveMinBars(count: number, from = '2026-01-05T14:30:00.000Z'): RawBar[] {
  const start = Date.parse(from);
  return Array.from({ length: count }, (_, i) => {
    const time = new Date(start + i * 5 * 60_000).toISOString();
    return { time, open: 100, high: 101, low: 99, close: 100, volume: 1000 };
  });
}

function makeView(base: RawBar[], remainingBars: number): TrainerView {
  return {
    caseId: 'case-1',
    symbol: 'TRAIN01',
    basePeriod: '5m',
    ladder: ['5m', '15m', '1h'],
    cursor: base.length - 1,
    asOf: base.at(-1)?.time ?? '2026-01-05T14:30:00.000Z',
    bars: { base, mid: base, top: base },
    quote: {},
    phase: 'flat',
    order: null,
    position: null,
    trades: [],
    netR: 0,
    remainingBars,
    terminal: false,
    result: null,
  };
}

describe('remainingBarsAt', () => {
  // The base tier is what remainingBars is already counted in, so it passes through untouched and
  // carries no hedge.
  it('quotes the base tier exactly', () => {
    expect(remainingBarsAt(makeView(fiveMinBars(120), 152), '5m')).toEqual({
      count: 152,
      approximate: false,
    });
  });

  // The bug this exists for: 152 five-minute bars are not 152 hourly bars, and the header claimed
  // they were the moment the trader switched timeframe.
  it('converts to the tier on screen instead of quoting base bars', () => {
    // Twelve 5m bars to an hour: 152 / 12 = 12.67, and the trailing part-hour is still a step.
    expect(remainingBarsAt(makeView(fiveMinBars(120), 152), '1h')).toEqual({
      count: 13,
      approximate: true,
    });
    expect(remainingBarsAt(makeView(fiveMinBars(120), 152), '15m')).toEqual({
      count: 51,
      approximate: true,
    });
  });

  it('rounds a part-filled bucket up, because it is still one more step', () => {
    expect(remainingBarsAt(makeView(fiveMinBars(120), 1), '1h').count).toBe(1);
    expect(remainingBarsAt(makeView(fiveMinBars(120), 12), '1h').count).toBe(1);
    expect(remainingBarsAt(makeView(fiveMinBars(120), 13), '1h').count).toBe(2);
  });

  // A session's length is not a constant the client knows, so the ratio is read off the case's own
  // history: a 78-bar 5m day is one 'day' bucket.
  it('reads the session length off the revealed bars for a day tier', () => {
    expect(remainingBarsAt(makeView(fiveMinBars(78), 156), 'day')).toEqual({
      count: 2,
      approximate: true,
    });
  });

  it('never reports a negative count', () => {
    expect(remainingBarsAt(makeView(fiveMinBars(120), -3), '1h').count).toBe(0);
    expect(remainingBarsAt(makeView(fiveMinBars(120), -3), '5m').count).toBe(0);
  });

  it('falls back to a one-to-one reading with no revealed bars to measure', () => {
    expect(remainingBarsAt(makeView([], 40), '1h')).toEqual({ count: 40, approximate: false });
  });
});
