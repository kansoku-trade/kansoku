import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RawBar } from '@kansoku/shared/types';

const provider = vi.hoisted(() => ({
  name: 'mock',
  capabilities: new Set<string>(),
  getKline: vi.fn(),
  getQuotes: vi.fn(),
  getNews: vi.fn(),
}));

vi.mock('../src/marketdata/registry.js', () => ({ getProvider: () => provider }));

const { symbolsService } = await import('../src/symbols/symbols.service.js');

function bar(time: string): RawBar {
  return { time, open: 1, high: 1, low: 1, close: 1, volume: 100 };
}

describe('symbolsService.benchmark gates the US-only benchmark module for non-US symbols', () => {
  const HK_REGULAR_TS = '2026-07-08T02:00:00.000Z';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(HK_REGULAR_TS));
    provider.getKline.mockReset().mockImplementation(() => Promise.resolve([bar(HK_REGULAR_TS)]));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns an empty benchmark and fetches no klines for a non-US primary symbol', async () => {
    const result = await symbolsService.benchmark({ sym: '700.HK' });
    expect(result).toEqual([]);
    expect(provider.getKline).not.toHaveBeenCalled();
  });
});

describe('symbolsService.benchmark — US primary symbol regression', () => {
  const US_REGULAR_TS = '2026-07-02T15:00:00.000Z';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(US_REGULAR_TS));
    provider.getKline.mockReset().mockImplementation(() => Promise.resolve([bar(US_REGULAR_TS)]));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps MU.US alongside SMH.US/QQQ.US during shared US regular hours', async () => {
    const result = await symbolsService.benchmark({ sym: 'MU.US' });
    expect(result.map((s) => s.symbol)).toEqual(['MU.US', 'SMH.US', 'QQQ.US']);
  });
});
