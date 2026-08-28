import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDb, type Db } from '../src/db/index.js';
import { createCalendarAdapter, MARKET_CALENDAR_SOURCE } from '../src/events/sources/calendar.js';
import { createEventRuntime } from '../src/events/runtime.js';
import { readSourceState } from '../src/events/store.js';
import { nextEarnings, nextEarningsStrict, resetEventCachesForTests } from '../src/marketdata/events.js';
import type { MarketDataProvider } from '../src/marketdata/types.js';
import { buildHomeEventsStrict, resetHomeEventsForTests } from '../src/overview/homeEvents.js';
import { resetHomeExtrasForTests } from '../src/overview/homeExtras.js';

const provider: Partial<MarketDataProvider> = {};

vi.mock('../src/marketdata/registry.js', () => ({
  getProvider: () => provider,
}));

vi.mock('../src/marketdata/watchedMarketsStore.js', () => ({
  getWatchedMarketsOrDefault: () => ['US'],
}));

const NOW = new Date('2026-07-21T12:00:00Z');
const open: Db[] = [];

function db(): Db {
  const instance = createDb(':memory:');
  open.push(instance);
  return instance;
}

beforeEach(() => {
  resetHomeEventsForTests();
  resetHomeExtrasForTests();
  resetEventCachesForTests();
  for (const key of Object.keys(provider)) delete (provider as Record<string, unknown>)[key];
});

afterEach(() => {
  for (const instance of open.splice(0)) instance.$client.close();
});

function watchlist(symbols: string[]): void {
  provider.getWatchlistSymbols = vi.fn(async () => symbols);
  provider.getPositions = vi.fn(async () => []);
}

describe('strict calendar counts only real calendar source calls', () => {
  it('throws when every earnings and macro call failed, however healthy the watchlist was', async () => {
    // The watchlist answering is not the calendar working. Counting it as a success
    // is what let a completely dead calendar report itself as a quiet week.
    watchlist(['NVDA.US', 'AMD.US']);
    provider.getEarningsCalendar = vi.fn(async () => {
      throw new Error('earnings down');
    });
    provider.getMacroCalendar = vi.fn(async () => {
      throw new Error('macro down');
    });

    await expect(buildHomeEventsStrict(NOW)).rejects.toThrow(/earnings down|macro down/);
  });

  it('throws when every earnings call failed and the provider has no macro calendar at all', async () => {
    watchlist(['NVDA.US']);
    provider.getEarningsCalendar = vi.fn(async () => {
      throw new Error('earnings down');
    });

    await expect(buildHomeEventsStrict(NOW)).rejects.toThrow(/earnings down/);
  });

  it('still returns the half that answered', async () => {
    watchlist(['NVDA.US']);
    provider.getEarningsCalendar = vi.fn(async () => {
      throw new Error('earnings down');
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
    expect(result.failures.join(' ')).toMatch(/earnings down/);
  });

  it('reports an empty calendar as clean when nothing failed', async () => {
    watchlist([]);
    provider.getMacroCalendar = vi.fn(async () => ({ supported: true as const, items: [] }));

    const result = await buildHomeEventsStrict(NOW);
    expect(result.events.items).toEqual([]);
    expect(result.failures).toEqual([]);
  });
});

describe('market-calendar degrades when the whole calendar is down', () => {
  it('backs off and degrades instead of writing an empty calendar', async () => {
    watchlist(['NVDA.US']);
    provider.getEarningsCalendar = vi.fn(async () => {
      throw new Error('earnings down');
    });
    provider.getMacroCalendar = vi.fn(async () => {
      throw new Error('macro down');
    });

    const handle = db();
    const adapter = createCalendarAdapter({ loadHomeEvents: () => buildHomeEventsStrict(NOW) });
    const runtime = createEventRuntime({ adapters: [adapter], db: handle });

    await runtime.pollOnce(MARKET_CALENDAR_SOURCE);
    const first = await readSourceState(MARKET_CALENDAR_SOURCE, handle);
    expect(first?.failureStreak).toBe(1);
    expect(first?.nextAttemptAt).not.toBeNull();
    expect(first?.lastError).toMatch(/earnings down|macro down/);

    resetHomeEventsForTests();
    resetEventCachesForTests();
    await runtime.pollOnce(MARKET_CALENDAR_SOURCE);
    const second = await readSourceState(MARKET_CALENDAR_SOURCE, handle);
    expect(second?.health).toBe('degraded');
  });
});

describe('the strict earnings read does not inherit a tolerant failure', () => {
  it('re-attempts instead of serving the null a failed tolerant call cached', async () => {
    const failing = vi.fn(async () => {
      throw new Error('earnings down');
    });
    provider.getEarningsCalendar = failing;

    // The sidebar swallows the failure and remembers "none" for the TTL.
    await expect(nextEarnings('NVDA.US', NOW)).resolves.toBeNull();
    expect(failing).toHaveBeenCalledTimes(1);

    // The collector must not read that as "no report scheduled".
    await expect(nextEarningsStrict('NVDA.US', NOW)).rejects.toThrow(/earnings down/);
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it('sees the real report once the provider recovers', async () => {
    provider.getEarningsCalendar = vi.fn(async () => {
      throw new Error('earnings down');
    });
    await expect(nextEarnings('NVDA.US', NOW)).resolves.toBeNull();

    provider.getEarningsCalendar = vi.fn(async () => ({
      date: '2026-07-23',
      title: 'NVDA Q2 财报',
    }));
    await expect(nextEarningsStrict('NVDA.US', NOW)).resolves.toEqual({
      date: '2026-07-23',
      title: 'NVDA Q2 财报',
    });
  });

  it('leaves the tolerant caching behaviour alone', async () => {
    const failing = vi.fn(async () => {
      throw new Error('earnings down');
    });
    provider.getEarningsCalendar = failing;

    await expect(nextEarnings('NVDA.US', NOW)).resolves.toBeNull();
    await expect(nextEarnings('NVDA.US', NOW)).resolves.toBeNull();
    // Unchanged on purpose: the sidebar would otherwise retry on every render.
    expect(failing).toHaveBeenCalledTimes(1);
  });

  it('still caches a genuine "nothing scheduled" for the strict reader', async () => {
    const empty = vi.fn(async () => null);
    provider.getEarningsCalendar = empty;

    await expect(nextEarningsStrict('NVDA.US', NOW)).resolves.toBeNull();
    await expect(nextEarningsStrict('NVDA.US', NOW)).resolves.toBeNull();
    expect(empty).toHaveBeenCalledTimes(1);
  });

  it('lets the strict read fill the cache the tolerant one serves', async () => {
    const once = vi.fn(async () => ({ date: '2026-07-23', title: 'NVDA Q2 财报' }));
    provider.getEarningsCalendar = once;

    await nextEarningsStrict('NVDA.US', NOW);
    await expect(nextEarnings('NVDA.US', NOW)).resolves.toEqual({
      date: '2026-07-23',
      title: 'NVDA Q2 财报',
    });
    expect(once).toHaveBeenCalledTimes(1);
  });
});
