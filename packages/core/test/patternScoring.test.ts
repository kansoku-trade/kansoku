import { describe, expect, it } from 'vitest';
import { offSessionSignalKeeper } from '../src/analysis/patternScoring.js';

// 2026-06-01T14:30:00Z = 10:30 ET Monday (regular session)
const REGULAR_BASE = Date.parse('2026-06-01T14:30:00.000Z') / 1000;
// 2026-05-31 is a Sunday — every bar classifies as overnight regardless of index
const OVERNIGHT_BASE = Date.parse('2026-05-31T14:30:00.000Z') / 1000;
const STEP = 300;

function makeTimes(n: number, base: number): number[] {
  return Array.from({ length: n }, (_, i) => base + i * STEP);
}

describe('offSessionSignalKeeper', () => {
  it('keeps overnight structural signals only on a volume impulse', () => {
    const timesTs = makeTimes(40, OVERNIGHT_BASE);
    const vols = Array.from({ length: 40 }, () => 1000);
    const keepThin = offSessionSignalKeeper(timesTs, vols);
    expect(keepThin(timesTs[30])).toBe(false);

    vols[30] = 2000; // 2× the 20-bar average
    const keepImpulse = offSessionSignalKeeper(timesTs, vols);
    expect(keepImpulse(timesTs[30])).toBe(true);
  });

  it('keeps every regular-session signal regardless of volume', () => {
    const timesTs = makeTimes(40, REGULAR_BASE);
    const vols = Array.from({ length: 40 }, () => 1000);
    const keepRegular = offSessionSignalKeeper(timesTs, vols);
    expect(keepRegular(timesTs[30])).toBe(true);
  });
});
