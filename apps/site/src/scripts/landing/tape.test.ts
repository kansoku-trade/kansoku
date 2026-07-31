import { describe, expect, it } from 'vitest';

import { formatTapeChange, formatTapeLast, parseTapeQuotes, tapeDirection } from './tape';

describe('parseTapeQuotes', () => {
  it('keeps well-formed quotes', () => {
    const payload = {
      quotes: [
        { symbol: 'SPX', last: 7451.3501, changePercent: 0.1845 },
        { symbol: 'VIX', last: 17.32, changePercent: -1.3458 },
      ],
    };
    expect(parseTapeQuotes(payload)).toEqual([
      { symbol: 'SPX', last: 7451.3501, changePercent: 0.1845 },
      { symbol: 'VIX', last: 17.32, changePercent: -1.3458 },
    ]);
  });

  it('drops malformed entries but keeps the rest', () => {
    const payload = {
      quotes: [
        { symbol: 'SPX', last: 7451, changePercent: 0.18 },
        { symbol: '<img>', last: 1, changePercent: 1 },
        { symbol: 'NDX', last: 'high', changePercent: 0.1 },
        { symbol: 'VIX', last: Number.NaN, changePercent: 0.1 },
        null,
      ],
    };
    expect(parseTapeQuotes(payload)).toEqual([{ symbol: 'SPX', last: 7451, changePercent: 0.18 }]);
  });

  it('returns empty for non-object payloads', () => {
    expect(parseTapeQuotes(null)).toEqual([]);
    expect(parseTapeQuotes('quotes')).toEqual([]);
    expect(parseTapeQuotes({ quotes: 'nope' })).toEqual([]);
  });
});

describe('tapeDirection', () => {
  it('classifies by the displayed rounding, not the raw value', () => {
    expect(tapeDirection(0.1845)).toBe('up');
    expect(tapeDirection(-1.3458)).toBe('down');
    expect(tapeDirection(0.001)).toBe('flat');
    expect(tapeDirection(-0.004)).toBe('flat');
    expect(tapeDirection(0)).toBe('flat');
  });
});

describe('formatTapeLast', () => {
  it('renders two decimals', () => {
    expect(formatTapeLast(7451.3501)).toBe('7451.35');
    expect(formatTapeLast(17.3)).toBe('17.30');
  });
});

describe('formatTapeChange', () => {
  it('signs positive and negative changes', () => {
    expect(formatTapeChange(0.1845)).toBe('+0.18%');
    expect(formatTapeChange(-1.3458)).toBe('-1.35%');
  });

  it('renders near-zero as unsigned flat', () => {
    expect(formatTapeChange(0.001)).toBe('0.00%');
    expect(formatTapeChange(-0.004)).toBe('0.00%');
  });
});
