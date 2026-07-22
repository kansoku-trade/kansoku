import { describe, expect, it } from 'vitest';
import { ClientError } from '../src/platform/errors.js';
import { fromYahooSymbol, toYahooSymbol } from '../src/marketdata/yahoo/symbolMap.js';
import { normalizeSymbol } from '../src/symbols/symbol.utils.js';

describe('toYahooSymbol', () => {
  it('strips the .US suffix from a plain ticker', () => {
    expect(toYahooSymbol('AAPL.US')).toBe('AAPL');
  });

  it('normalizes a bare ticker before mapping', () => {
    expect(toYahooSymbol('MU')).toBe('MU');
  });

  it('maps a leading-dot index proxy to a caret-prefixed symbol', () => {
    expect(toYahooSymbol('.SOX.US')).toBe('^SOX');
  });

  it('throws for an HK symbol', () => {
    expect(() => toYahooSymbol('700.HK')).toThrow(ClientError);
    expect(() => toYahooSymbol('700.HK')).toThrow(/700\.HK/);
  });

  it('throws for a CN symbol', () => {
    expect(() => toYahooSymbol('600519.SH')).toThrow(ClientError);
    expect(() => toYahooSymbol('000001.SZ')).toThrow(ClientError);
  });

  it('names the hint when the market is unsupported', () => {
    try {
      toYahooSymbol('700.HK');
      throw new Error('expected toYahooSymbol to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ClientError);
      expect((error as ClientError).hint).toMatch(/market not supported by the yahoo provider yet/);
    }
  });
});

describe('fromYahooSymbol', () => {
  it('appends .US to a plain ticker', () => {
    expect(fromYahooSymbol('AAPL')).toBe('AAPL.US');
  });

  it('maps a caret-prefixed symbol back to a leading-dot index proxy', () => {
    expect(fromYahooSymbol('^SOX')).toBe('.SOX.US');
  });

  it('throws for a yahoo symbol that looks non-US', () => {
    expect(() => fromYahooSymbol('0700.HK')).toThrow(ClientError);
  });
});

describe('round trip', () => {
  it.each(['AAPL.US', 'MU', '.SOX.US', 'mu.us'])('recovers the normalized form of %s', (raw) => {
    expect(fromYahooSymbol(toYahooSymbol(raw))).toBe(normalizeSymbol(raw));
  });
});
