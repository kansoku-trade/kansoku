import { describe, expect, it } from 'vitest';
import { marketOf, noteFileName, normalizeSymbol } from '../src/symbols/symbol.utils.js';

describe('marketOf', () => {
  it('derives US from the .US suffix', () => {
    expect(marketOf('MU.US')).toBe('US');
  });

  it('derives HK from the .HK suffix', () => {
    expect(marketOf('700.HK')).toBe('HK');
  });

  it('derives CN from the .SH suffix', () => {
    expect(marketOf('600519.SH')).toBe('CN');
  });

  it('derives CN from the .SZ suffix', () => {
    expect(marketOf('000001.SZ')).toBe('CN');
  });

  it('is case-insensitive', () => {
    expect(marketOf('700.hk')).toBe('HK');
    expect(marketOf('600519.sh')).toBe('CN');
    expect(marketOf('000001.sz')).toBe('CN');
  });

  it('treats a bare symbol as US', () => {
    expect(marketOf('MU')).toBe('US');
  });
});

describe('normalizeSymbol', () => {
  it('appends .US to a bare ticker', () => {
    expect(normalizeSymbol('mu')).toBe('MU.US');
  });

  it('passes an existing .US suffix through unchanged', () => {
    expect(normalizeSymbol('mu.us')).toBe('MU.US');
  });

  it('passes an existing .HK suffix through unchanged', () => {
    expect(normalizeSymbol('700.hk')).toBe('700.HK');
  });

  it('passes an existing .SH suffix through unchanged', () => {
    expect(normalizeSymbol('600519.sh')).toBe('600519.SH');
  });

  it('passes an existing .SZ suffix through unchanged', () => {
    expect(normalizeSymbol('000001.sz')).toBe('000001.SZ');
  });
});

describe('noteFileName', () => {
  it('strips the .US suffix', () => {
    expect(noteFileName('MU.US')).toBe('MU');
  });

  it('keeps a bare ticker as-is', () => {
    expect(noteFileName('MU')).toBe('MU');
  });

  it("keeps the .HK suffix so files don't collide", () => {
    expect(noteFileName('700.hk')).toBe('700.HK');
  });

  it("keeps the .SH suffix so files don't collide", () => {
    expect(noteFileName('600519.sh')).toBe('600519.SH');
  });

  it("keeps the .SZ suffix so files don't collide", () => {
    expect(noteFileName('000001.sz')).toBe('000001.SZ');
  });
});
