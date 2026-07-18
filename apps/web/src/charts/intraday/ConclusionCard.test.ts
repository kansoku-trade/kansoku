import { describe, expect, it } from 'vitest';
import { conclusionOutdated } from './ConclusionCard';

const ET_0758_JUL15 = '2026-07-15T11:58:00Z';
const ET_0700_JUL16 = '2026-07-16T11:00:00Z';
const ET_1600_JUL15 = '2026-07-15T20:00:00Z';
const ET_2330_JUL15 = '2026-07-16T03:30:00Z';

describe('conclusionOutdated', () => {
  it('stale flag wins regardless of age', () => {
    expect(conclusionOutdated(ET_0700_JUL16, true, Date.parse(ET_0700_JUL16))).toBe(true);
  });

  it('previous market day is outdated even within 24h', () => {
    expect(conclusionOutdated(ET_0758_JUL15, false, Date.parse(ET_0700_JUL16))).toBe(true);
  });

  it('same market day after close is not outdated', () => {
    expect(conclusionOutdated(ET_0758_JUL15, false, Date.parse(ET_1600_JUL15))).toBe(false);
  });

  it('uses ET date boundary, not UTC', () => {
    expect(conclusionOutdated(ET_1600_JUL15, false, Date.parse(ET_2330_JUL15))).toBe(false);
  });

  it('missing generated_at is never outdated', () => {
    expect(conclusionOutdated(null, false, Date.parse(ET_0700_JUL16))).toBe(false);
    expect(conclusionOutdated(undefined, false, Date.parse(ET_0700_JUL16))).toBe(false);
  });
});
