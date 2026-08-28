import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextEarningsStrict } from '../src/marketdata/events.js';
import type { MarketDataProvider } from '../src/marketdata/types.js';
import { buildHomeEvents, resetHomeEventsForTests } from '../src/overview/homeEvents.js';
import { resetHomeExtrasForTests } from '../src/overview/homeExtras.js';

const provider: Partial<MarketDataProvider> = {};

vi.mock('../src/marketdata/registry.js', () => ({
  getProvider: () => provider,
}));

vi.mock('../src/marketdata/watchedMarketsStore.js', () => ({
  getWatchedMarketsOrDefault: () => ['US'],
}));

vi.mock('../src/marketdata/events.js', () => ({
  nextEarningsStrict: vi.fn(async (symbol: string) =>
    symbol === 'NVDA.US'
      ? { date: '2026-07-23', title: 'NVDA Q2 财报' }
      : symbol === 'FAR.US'
        ? { date: '2026-12-01', title: '远期财报' }
        : null,
  ),
}));

const NOW = new Date('2026-07-21T12:00:00Z');

beforeEach(() => {
  resetHomeEventsForTests();
  resetHomeExtrasForTests();
  provider.getWatchlistSymbols = vi.fn(async () => ['NVDA.US', 'FAR.US']);
  provider.getPositions = vi.fn(async () => [
    {
      symbol: 'NVDA.US',
      available: '1',
      cost_price: '1',
      currency: 'USD',
      market: 'US',
      name: 'NVDA',
      quantity: '1',
    },
  ]);
  provider.getMacroCalendar = vi.fn(async () => ({
    supported: true as const,
    items: [
      {
        ts: '2026-07-21T12:30:00Z',
        title: '美国, CPI',
        estimate: '2.9',
        previous: '3.1',
        actual: '2.9',
      },
    ],
  }));
});

describe('buildHomeEvents', () => {
  it('merges earnings and macro items sorted by date, marks owned, drops far earnings', async () => {
    const events = await buildHomeEvents(NOW);
    expect(events.date).toBe('2026-07-21');
    expect(events.items).toHaveLength(2);
    expect(events.items[0]).toMatchObject({
      kind: 'macro',
      title: '美国, CPI',
      actual: '2.9',
      date: '2026-07-21',
    });
    expect(events.items[1]).toMatchObject({
      kind: 'earnings',
      symbol: 'NVDA.US',
      owned: true,
      date: '2026-07-23',
    });
  });

  it('caches the result within the TTL', async () => {
    await buildHomeEvents(NOW);
    const calls = (nextEarningsStrict as ReturnType<typeof vi.fn>).mock.calls.length;
    await buildHomeEvents(NOW);
    expect((nextEarningsStrict as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls);
  });

  it('returns macro items even when earnings sources fail', async () => {
    provider.getWatchlistSymbols = vi.fn(async () => {
      throw new Error('boom');
    });
    provider.getPositions = vi.fn(async () => {
      throw new Error('boom');
    });
    const events = await buildHomeEvents(NOW);
    expect(events.items).toHaveLength(1);
    expect(events.items[0].kind).toBe('macro');
  });
});
