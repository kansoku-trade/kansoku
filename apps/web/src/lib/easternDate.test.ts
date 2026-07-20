import { describe, expect, it } from 'vitest';
import { easternToday, isCurrentSessionId } from './easternDate';

describe('easternToday', () => {
  it('formats a UTC date as YYYY-MM-DD in America/New_York', () => {
    expect(easternToday(new Date('2026-07-21T18:00:00Z'))).toBe('2026-07-21');
  });

  it('rolls back to the previous day when UTC and Eastern dates differ', () => {
    expect(easternToday(new Date('2026-07-21T02:00:00Z'))).toBe('2026-07-20');
  });
});

describe('isCurrentSessionId', () => {
  it('is true when the id date prefix matches Eastern today', () => {
    const now = new Date('2026-07-21T18:00:00Z');
    expect(isCurrentSessionId('2026-07-21-mrvl-intraday', now)).toBe(true);
  });

  it('is false when the id date prefix is a previous session', () => {
    const now = new Date('2026-07-21T18:00:00Z');
    expect(isCurrentSessionId('2026-07-20-mrvl-intraday', now)).toBe(false);
  });

  it('accounts for the UTC/Eastern date offset', () => {
    const now = new Date('2026-07-21T02:00:00Z');
    expect(isCurrentSessionId('2026-07-20-mrvl-intraday', now)).toBe(true);
    expect(isCurrentSessionId('2026-07-21-mrvl-intraday', now)).toBe(false);
  });
});
