import { describe, expect, it } from 'vitest';
import { clampViewCount } from '../src/analysis/history.js';

describe('clampViewCount', () => {
  it('parses a positive integer', () => {
    expect(clampViewCount('300')).toBe(300);
  });

  it('floors fractional values', () => {
    expect(clampViewCount('300.9')).toBe(300);
  });

  it('does not cap large counts', () => {
    expect(clampViewCount('5000')).toBe(5000);
  });

  it('returns null for missing, empty, zero, negative, and non-numeric input', () => {
    expect(clampViewCount(undefined)).toBeNull();
    expect(clampViewCount('')).toBeNull();
    expect(clampViewCount('0')).toBeNull();
    expect(clampViewCount('-5')).toBeNull();
    expect(clampViewCount('abc')).toBeNull();
  });
});
