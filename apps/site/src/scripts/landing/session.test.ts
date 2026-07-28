import { describe, expect, it } from 'vitest';

import type { EtMoment } from './session';
import { marketSession } from './session';

const weekday = (weekday: number, minutes: number): EtMoment => ({ weekday, minutes });

describe('marketSession', () => {
  it('returns PRE during the pre-market window', () => {
    expect(marketSession(weekday(3, 300))).toBe('PRE');
  });

  it('returns OPEN during regular trading hours', () => {
    expect(marketSession(weekday(3, 600))).toBe('OPEN');
  });

  it('returns POST during the after-hours window', () => {
    expect(marketSession(weekday(3, 1000))).toBe('POST');
  });

  it('returns CLOSED outside every session window', () => {
    expect(marketSession(weekday(3, 100))).toBe('CLOSED');
  });

  it('treats minutes 569 as PRE, just before the open boundary', () => {
    expect(marketSession(weekday(3, 569))).toBe('PRE');
  });

  it('treats minutes 570 as OPEN, exactly at the open boundary', () => {
    expect(marketSession(weekday(3, 570))).toBe('OPEN');
  });

  it('treats minutes 1200 as CLOSED, exactly at the after-hours cutoff', () => {
    expect(marketSession(weekday(3, 1200))).toBe('CLOSED');
  });

  it('returns CLOSED on Sunday even inside the regular trading window', () => {
    expect(marketSession(weekday(0, 600))).toBe('CLOSED');
  });

  it('returns CLOSED on Saturday even inside the regular trading window', () => {
    expect(marketSession(weekday(6, 600))).toBe('CLOSED');
  });
});
