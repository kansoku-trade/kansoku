import { describe, expect, it } from 'vitest';

import type { ScoredJudgment } from './scorecardData';
import { hitRate, scoredJudgments } from './scorecardData';

const record = (outcome: ScoredJudgment['outcome']): ScoredJudgment => ({
  symbol: 'TEST.US',
  date: '2026-01-01',
  call: 'test',
  outcome,
});

describe('hitRate', () => {
  it('matches a manual count of hits', () => {
    const records = [record('hit'), record('hit'), record('miss'), record('hit')];
    expect(hitRate(records)).toBe(75);
  });

  it('returns 0 for an empty array', () => {
    expect(hitRate([])).toBe(0);
  });

  it('returns 100 when every record hits', () => {
    expect(hitRate([record('hit'), record('hit'), record('hit')])).toBe(100);
  });

  it('returns 0 when every record misses', () => {
    expect(hitRate([record('miss'), record('miss')])).toBe(0);
  });
});

describe('scoredJudgments', () => {
  it('has between 10 and 14 records', () => {
    expect(scoredJudgments.length).toBeGreaterThanOrEqual(10);
    expect(scoredJudgments.length).toBeLessThanOrEqual(14);
  });

  it('has at least 3 misses', () => {
    const misses = scoredJudgments.filter((item) => item.outcome === 'miss').length;
    expect(misses).toBeGreaterThanOrEqual(3);
  });

  it('has at least one hit', () => {
    expect(scoredJudgments.some((item) => item.outcome === 'hit')).toBe(true);
  });
});
