import { describe, expect, it } from 'vitest';
import { detectSecondBreakouts } from '../src/analysis/secondBreakout.js';

function bars(closes: number[]): {
  highs: number[];
  lows: number[];
  closes: number[];
  timesTs: number[];
} {
  return {
    highs: closes.map((c) => c + 0.5),
    lows: closes.map((c) => c - 0.5),
    closes,
    timesTs: closes.map((_, i) => 1_700_000_000 + i * 300),
  };
}

const ramp = (from: number, to: number, step: number) => {
  const out: number[] = [];
  for (let v = from; step > 0 ? v <= to : v >= to; v += step) out.push(v);
  return out;
};

const UP_TREND = ramp(100, 130, 1);
const UP_H2_STRUCTURE = [
  129, 128, 127, 126, 125,
  126, 127, 128,
  127, 126, 125, 124, 123,
  124, 125, 126, 127, 126, 125, 124,
  125, 126, 127, 128,
];

const DOWN_TREND = ramp(130, 100, -1);
const DOWN_L2_STRUCTURE = [
  101, 102, 103, 104, 105,
  104, 103, 102,
  103, 104, 105, 106, 107,
  106, 105, 104, 103, 104, 105, 106,
  105, 104, 103, 102,
];

describe('detectSecondBreakouts', () => {
  it('detects a confirmed H2 in an uptrend', () => {
    const closes = [...UP_TREND, ...UP_H2_STRUCTURE];
    const { highs, lows, closes: c, timesTs } = bars(closes);
    const found = detectSecondBreakouts(highs, lows, c, timesTs);
    expect(found).toHaveLength(1);
    const sb = found[0];
    expect(sb.kind).toBe('H2');
    expect(sb.status).toBe('confirmed');
    expect(sb.first.price).toBe(128.5);
    expect(sb.signal.price).toBe(127.5);
    expect(sb.trigger).not.toBeNull();
    expect(sb.trigger?.price).toBe(128.5);
    expect(sb.trigger?.time).toBe(timesTs[UP_TREND.length + 23]);
  });

  it('detects a confirmed L2 in a downtrend', () => {
    const closes = [...DOWN_TREND, ...DOWN_L2_STRUCTURE];
    const { highs, lows, closes: c, timesTs } = bars(closes);
    const found = detectSecondBreakouts(highs, lows, c, timesTs);
    expect(found).toHaveLength(1);
    const sb = found[0];
    expect(sb.kind).toBe('L2');
    expect(sb.status).toBe('confirmed');
    expect(sb.first.price).toBe(101.5);
    expect(sb.signal.price).toBe(102.5);
    expect(sb.trigger).not.toBeNull();
    expect(sb.trigger?.price).toBe(101.5);
    expect(sb.trigger?.time).toBe(timesTs[DOWN_TREND.length + 23]);
  });

  it('stays quiet in a range crossing EMA20 repeatedly', () => {
    const closes = Array.from({ length: 80 }, (_, i) => 100 + (i % 4 < 2 ? 1 : -1));
    const { highs, lows, closes: c, timesTs } = bars(closes);
    expect(detectSecondBreakouts(highs, lows, c, timesTs)).toHaveLength(0);
  });

  const buildAttemptGapStructure = (descentStep: number) => [
    ...UP_TREND,
    129, 128, 127, 126, 125,
    126, 127, 128,
    ...ramp(127, 123, -descentStep),
    124, 125, 126, 127, 126, 125, 124,
    125, 126, 127, 128,
  ];

  it('detects the H2 when the two attempts still fit within MAX_ATTEMPT_GAP', () => {
    const closes = buildAttemptGapStructure(0.2);
    const { highs, lows, closes: c, timesTs } = bars(closes);
    const found = detectSecondBreakouts(highs, lows, c, timesTs);
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe('H2');
  });

  it('drops the structure when the two attempts are too far apart', () => {
    const closes = buildAttemptGapStructure(0.1);
    const { highs, lows, closes: c, timesTs } = bars(closes);
    expect(detectSecondBreakouts(highs, lows, c, timesTs)).toHaveLength(0);
  });
});
