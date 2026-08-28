import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDb, type Db } from '../src/db/index.js';
import { createCalendarAdapter, MARKET_CALENDAR_SOURCE } from '../src/events/sources/calendar.js';
import { createEventRuntime } from '../src/events/runtime.js';
import { readSourceState } from '../src/events/store.js';
import { resetEventCachesForTests } from '../src/marketdata/events.js';
import type { MacroCalendarResult, MarketDataProvider } from '../src/marketdata/types.js';
import {
  buildHomeEvents,
  buildHomeEventsStrict,
  resetHomeEventsForTests,
} from '../src/overview/homeEvents.js';
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

const CPI = {
  sourceId: 'us-cpi-2026-07',
  ts: '2026-07-21T12:30:00Z',
  title: '美国, CPI',
  estimate: null,
  previous: null,
  actual: null,
};

function macroOk(): () => Promise<MacroCalendarResult> {
  return vi.fn(async () => ({ supported: true as const, items: [CPI] }));
}

function macroDown(): () => Promise<MacroCalendarResult> {
  return vi.fn(async () => {
    throw new Error('macro down');
  });
}

function watchlist(symbols: string[]): void {
  provider.getWatchlistSymbols = vi.fn(async () => symbols);
  provider.getPositions = vi.fn(async () => []);
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

describe('a tolerant read must not launder a broken calendar into the strict one', () => {
  it('does not turn a totally failed tolerant read into a clean strict read', async () => {
    watchlist(['NVDA.US']);
    provider.getEarningsCalendar = vi.fn(async () => {
      throw new Error('earnings down');
    });
    provider.getMacroCalendar = macroDown();

    // The home page shrugs and shows an empty calendar, and caches it for the TTL.
    const home = await buildHomeEvents(NOW);
    expect(home.items).toEqual([]);

    // The collector must not be handed that as "read fine, nothing scheduled".
    await expect(buildHomeEventsStrict(NOW)).rejects.toThrow(/earnings down|macro down/);
  });

  it('does not report failures: [] for a partly failed tolerant read', async () => {
    watchlist(['NVDA.US']);
    provider.getEarningsCalendar = vi.fn(async () => ({ date: '2026-07-23', title: 'NVDA Q2' }));
    provider.getMacroCalendar = macroDown();

    const home = await buildHomeEvents(NOW);
    expect(home.items).toHaveLength(1);

    const strict = await buildHomeEventsStrict(NOW);
    expect(strict.failures.join(' ')).toMatch(/macro down/);
    expect(strict.events.items).toHaveLength(1);
  });

  it('re-reads the calendar rather than trusting an incomplete cache', async () => {
    watchlist(['NVDA.US']);
    provider.getEarningsCalendar = vi.fn(async () => ({ date: '2026-07-23', title: 'NVDA Q2' }));
    provider.getMacroCalendar = macroDown();
    await buildHomeEvents(NOW);

    // The macro feed comes back before the tolerant TTL expires. The strict reader has
    // to notice, or the collector sits on a half calendar for the rest of the window.
    const healed = macroOk();
    provider.getMacroCalendar = healed;

    const strict = await buildHomeEventsStrict(NOW);
    expect(healed).toHaveBeenCalled();
    expect(strict.failures).toEqual([]);
    expect(strict.events.items).toHaveLength(2);
  });

  it('does not let a failed tolerant read block a later clean strict read from caching', async () => {
    watchlist(['NVDA.US']);
    provider.getEarningsCalendar = vi.fn(async () => ({ date: '2026-07-23', title: 'NVDA Q2' }));
    provider.getMacroCalendar = macroDown();
    await buildHomeEvents(NOW);

    provider.getMacroCalendar = macroOk();
    await buildHomeEventsStrict(NOW);

    const second = macroOk();
    provider.getMacroCalendar = second;
    const strict = await buildHomeEventsStrict(NOW);
    expect(second).not.toHaveBeenCalled();
    expect(strict.events.items).toHaveLength(2);
  });

  it('still shares a clean tolerant read with the strict one', async () => {
    watchlist(['NVDA.US']);
    provider.getEarningsCalendar = vi.fn(async () => ({ date: '2026-07-23', title: 'NVDA Q2' }));
    const macro = macroOk();
    provider.getMacroCalendar = macro;

    await buildHomeEvents(NOW);
    const strict = await buildHomeEventsStrict(NOW);

    // A complete read is still a complete read: no reason to ask twice.
    expect(macro).toHaveBeenCalledTimes(1);
    expect(strict.failures).toEqual([]);
    expect(strict.events.items).toHaveLength(2);
  });
});

describe('the home page keeps its lenient behaviour', () => {
  it('returns the partial calendar and serves the rest of the TTL from cache', async () => {
    watchlist(['NVDA.US']);
    provider.getEarningsCalendar = vi.fn(async () => ({ date: '2026-07-23', title: 'NVDA Q2' }));
    const macro = macroDown();
    provider.getMacroCalendar = macro;

    const first = await buildHomeEvents(NOW);
    const second = await buildHomeEvents(NOW);

    expect(first.items).toHaveLength(1);
    expect(second).toEqual(first);
    expect(macro).toHaveBeenCalledTimes(1);
  });

  it('reports an empty calendar rather than throwing when everything is down', async () => {
    watchlist(['NVDA.US']);
    provider.getEarningsCalendar = vi.fn(async () => {
      throw new Error('earnings down');
    });
    provider.getMacroCalendar = macroDown();

    const home = await buildHomeEvents(NOW);
    expect(home.date).toBe('2026-07-21');
    expect(home.items).toEqual([]);
  });

  it('serves a strict partial read to the home page without another round trip', async () => {
    watchlist(['NVDA.US']);
    provider.getEarningsCalendar = vi.fn(async () => ({ date: '2026-07-23', title: 'NVDA Q2' }));
    provider.getMacroCalendar = macroDown();

    await buildHomeEventsStrict(NOW);
    const home = await buildHomeEvents(NOW);
    expect(home.items).toHaveLength(1);
  });
});

describe('market-calendar degrades even after the home page cached a failure', () => {
  it('backs off instead of reading the poisoned cache as a healthy poll', async () => {
    watchlist(['NVDA.US']);
    provider.getEarningsCalendar = vi.fn(async () => {
      throw new Error('earnings down');
    });
    provider.getMacroCalendar = macroDown();
    await buildHomeEvents(NOW);

    const handle = db();
    const adapter = createCalendarAdapter({ loadHomeEvents: () => buildHomeEventsStrict(NOW) });
    const runtime = createEventRuntime({ adapters: [adapter], db: handle });

    await runtime.pollOnce(MARKET_CALENDAR_SOURCE);
    await runtime.pollOnce(MARKET_CALENDAR_SOURCE);

    const state = await readSourceState(MARKET_CALENDAR_SOURCE, handle);
    expect(state?.health).toBe('degraded');
    expect(state?.lastError).toMatch(/earnings down|macro down/);
    expect(state?.nextAttemptAt).not.toBeNull();
  });

  it('reports the partial failure through diagnostics after a tolerant partial read', async () => {
    watchlist(['NVDA.US']);
    provider.getEarningsCalendar = vi.fn(async () => ({ date: '2026-07-23', title: 'NVDA Q2' }));
    provider.getMacroCalendar = macroDown();
    await buildHomeEvents(NOW);

    const notes: string[] = [];
    const adapter = createCalendarAdapter({
      loadHomeEvents: () => buildHomeEventsStrict(NOW),
      onDiagnostic: (note) => notes.push(note),
    });

    const result = await adapter.poll!({ cursor: null });

    expect(result.drafts).toHaveLength(1);
    expect(notes.join(' ')).toMatch(/macro down/);
  });
});
