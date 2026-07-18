import { describe, expect, it } from 'vitest';
import { marketOfSymbol } from './market';

describe('marketOfSymbol', () => {
  it('derives US from a .US suffix', () => {
    expect(marketOfSymbol('MU.US')).toBe('US');
  });

  it('derives HK from a .HK suffix', () => {
    expect(marketOfSymbol('700.HK')).toBe('HK');
  });

  it('derives CN from .SH and .SZ suffixes', () => {
    expect(marketOfSymbol('600519.SH')).toBe('CN');
    expect(marketOfSymbol('000001.SZ')).toBe('CN');
  });

  it('is case-insensitive', () => {
    expect(marketOfSymbol('700.hk')).toBe('HK');
  });

  it('defaults to US for a bare or unknown symbol', () => {
    expect(marketOfSymbol('MU')).toBe('US');
    expect(marketOfSymbol('700.SG')).toBe('US');
  });

  it('defaults to US for empty input', () => {
    expect(marketOfSymbol(null)).toBe('US');
    expect(marketOfSymbol('')).toBe('US');
  });
});
