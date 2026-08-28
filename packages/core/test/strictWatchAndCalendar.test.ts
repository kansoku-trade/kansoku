import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketDataProvider } from '../src/marketdata/types.js';
import {
  buildHomeEvents,
  buildHomeEventsStrict,
  resetHomeEventsForTests,
} from '../src/overview/homeEvents.js';
import {
  getWatchSymbols,
  getWatchSymbolsStrict,
  resetHomeExtrasForTests,
} from '../src/overview/homeExtras.js';
import { resetEventCachesForTests } from '../src/marketdata/events.js';

const provider: Partial<MarketDataProvider> = {};

vi.mock('../src/marketdata/registry.js', () => ({
  getProvider: () => provider,
}));

vi.mock('../src/marketdata/watchedMarketsStore.js', () => ({
  getWatchedMarketsOrDefault: () => ['US'],
}));

const NOW = new Date('2026-07-21T12:00:00Z');

function position(symbol: string) {
  return {
    symbol,
    available: '1',
    cost_price: '1',
    currency: 'USD',
    market: 'US',
    name: symbol,
    quantity: '1',
  };
}

beforeEach(() => {
  resetHomeEventsForTests();
  resetHomeExtrasForTests();
  resetEventCachesForTests();
  for (const key of Object.keys(provider)) delete (provider as Record<string, unknown>)[key];
});

describe('getWatchSymbolsStrict', () => {
  it('throws when both the watchlist and the positions read fail', async () => {
    provider.getWatchlistSymbols = vi.fn(async () => {
      throw new Error('watchlist down');
    });
    provider.getPositions = vi.fn(async () => {
      throw new Error('positions down');
    });

    await expect(getWatchSymbolsStrict()).rejects.toThrow(/watch/i);
    // The home page still prefers an empty list over an error page.
    await expect(getWatchSymbols()).resolves.toEqual([]);
  });

  it('returns the half that answered when only one read fails', async () => {
    provider.getWatchlistSymbols = vi.fn(async () => {
      throw new Error('watchlist down');
    });
    provider.getPositions = vi.fn(async () => [position('NVDA.US')]);

    await expect(getWatchSymbolsStrict()).resolves.toEqual(['NVDA.US']);
  });

  it('reports an empty list without failing when the provider offers neither read', async () => {
    await expect(getWatchSymbolsStrict()).resolves.toEqual([]);
  });
});

describe('buildHomeEventsStrict', () => {
  it('throws when every upstream call fails, and caches nothing', async () => {
    provider.getWatchlistSymbols = vi.fn(async () => {
      throw new Error('watchlist down');
    });
    provider.getPositions = vi.fn(async () => {
      throw new Error('positions down');
    });
    provider.getMacroCalendar = vi.fn(async () => {
      throw new Error('calendar down');
    });

    await expect(buildHomeEventsStrict(NOW)).rejects.toThrow(/calendar|watch/i);

    // Nothing may be left behind for the tolerant path to serve as if it were fresh:
    // a later call has to try the provider again.
    provider.getWatchlistSymbols = vi.fn(async () => ['NVDA.US']);
    provider.getPositions = vi.fn(async () => []);
    provider.getEarningsCalendar = vi.fn(async () => ({
      date: '2026-07-23',
      title: 'NVDA Q2 财报',
    }));
    provider.getMacroCalendar = vi.fn(async () => ({ supported: true as const, items: [] }));
    const events = await buildHomeEvents(NOW);
    expect(events.items).toHaveLength(1);
  });

  it('returns the macro half plus a named failure when earnings sources are down', async () => {
    provider.getWatchlistSymbols = vi.fn(async () => {
      throw new Error('watchlist down');
    });
    provider.getPositions = vi.fn(async () => {
      throw new Error('positions down');
    });
    provider.getMacroCalendar = vi.fn(async () => ({
      supported: true as const,
      items: [
        {
          sourceId: 'us-cpi-2026-07',
          ts: '2026-07-21T12:30:00Z',
          title: '美国, CPI',
          estimate: null,
          previous: null,
          actual: null,
        },
      ],
    }));

    const result = await buildHomeEventsStrict(NOW);
    expect(result.events.items).toHaveLength(1);
    expect(result.events.items[0].kind).toBe('macro');
    expect(result.failures.join(' ')).toMatch(/watch/i);
  });

  it('returns the earnings half plus a named failure when the macro calendar is down', async () => {
    provider.getWatchlistSymbols = vi.fn(async () => ['NVDA.US']);
    provider.getPositions = vi.fn(async () => []);
    provider.getEarningsCalendar = vi.fn(async () => ({ date: '2026-07-23', title: 'NVDA Q2' }));
    provider.getMacroCalendar = vi.fn(async () => {
      throw new Error('calendar down');
    });

    const result = await buildHomeEventsStrict(NOW);
    expect(result.events.items).toHaveLength(1);
    expect(result.events.items[0].kind).toBe('earnings');
    expect(result.failures.join(' ')).toMatch(/calendar down/);
  });

  it('reports no failures and caches a clean read', async () => {
    provider.getWatchlistSymbols = vi.fn(async () => ['NVDA.US']);
    provider.getPositions = vi.fn(async () => []);
    const earnings = vi.fn(async () => ({ date: '2026-07-23', title: 'NVDA Q2' }));
    provider.getEarningsCalendar = earnings;
    provider.getMacroCalendar = vi.fn(async () => ({ supported: true as const, items: [] }));

    const first = await buildHomeEventsStrict(NOW);
    expect(first.failures).toEqual([]);
    const calls = earnings.mock.calls.length;
    const second = await buildHomeEventsStrict(NOW);
    expect(earnings.mock.calls.length).toBe(calls);
    expect(second.events.items).toHaveLength(1);
  });

  it('does not let a partly failed read poison the cache', async () => {
    provider.getWatchlistSymbols = vi.fn(async () => ['NVDA.US']);
    provider.getPositions = vi.fn(async () => []);
    provider.getEarningsCalendar = vi.fn(async () => ({ date: '2026-07-23', title: 'NVDA Q2' }));
    provider.getMacroCalendar = vi.fn(async () => {
      throw new Error('calendar down');
    });

    const partial = await buildHomeEventsStrict(NOW);
    expect(partial.failures).toHaveLength(1);

    provider.getMacroCalendar = vi.fn(async () => ({
      supported: true as const,
      items: [
        {
          sourceId: 'us-cpi-2026-07',
          ts: '2026-07-21T12:30:00Z',
          title: '美国, CPI',
          estimate: null,
          previous: null,
          actual: null,
        },
      ],
    }));
    const healed = await buildHomeEventsStrict(NOW);
    expect(healed.failures).toEqual([]);
    expect(healed.events.items).toHaveLength(2);
  });
});
