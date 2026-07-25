import { describe, expect, it } from 'vitest';
import { fetchKlineHistoryYahoo } from '../../src/generate/yahooFetcher.js';

describe('fetchKlineHistoryYahoo', () => {
  it.each(['1m', '5m', '15m', '30m'] as const)(
    'rejects %s, naming the period, without calling the network',
    async (period) => {
      await expect(
        fetchKlineHistoryYahoo('MRVL.US', period, '2026-01-01', '2026-01-31'),
      ).rejects.toThrow(`cannot fetch ${period} kline`);
    },
  );
});
