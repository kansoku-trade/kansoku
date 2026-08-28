import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  nextEarnings: vi.fn(async (symbol: string) =>
    symbol === 'NVDA.US' ? { date: '2026-07-23', title: 'NVDA Q2 财报' } : null,
  ),
  nextEarningsStrict: vi.fn(async (symbol: string) =>
    symbol === 'NVDA.US' ? { date: '2026-07-23', title: 'NVDA Q2 财报' } : null,
  ),
}));

const NOW = new Date('2026-07-21T12:00:00Z');

beforeEach(() => {
  resetHomeEventsForTests();
  resetHomeExtrasForTests();
  provider.getWatchlistSymbols = vi.fn(async () => ['NVDA.US']);
  provider.getPositions = vi.fn(async () => []);
});

describe('home events carry the provider identity', () => {
  it('passes the macro row source id through to the home item', async () => {
    provider.getMacroCalendar = vi.fn(async () => ({
      supported: true as const,
      items: [
        {
          sourceId: 'us-cpi-2026-07',
          ts: '2026-07-21T12:30:00Z',
          title: '美国, CPI (7月) 2.9%',
          estimate: '2.9',
          previous: '3.1',
          actual: '2.9',
        },
      ],
    }));

    const events = await buildHomeEvents(NOW);
    const macro = events.items.find((item) => item.kind === 'macro');
    expect(macro?.sourceId).toBe('us-cpi-2026-07');
  });

  it('reports a macro row with no stable id as having none', async () => {
    provider.getMacroCalendar = vi.fn(async () => ({
      supported: true as const,
      items: [
        {
          ts: '2026-07-21T12:30:00Z',
          title: '美国, CPI',
          estimate: null,
          previous: null,
          actual: null,
        },
      ],
    }));

    const events = await buildHomeEvents(NOW);
    const macro = events.items.find((item) => item.kind === 'macro');
    expect(macro?.sourceId ?? null).toBeNull();
  });

  it('leaves earnings without a source id, since symbol plus date already is one', async () => {
    provider.getMacroCalendar = vi.fn(async () => ({ supported: true as const, items: [] }));
    const events = await buildHomeEvents(NOW);
    const earnings = events.items.find((item) => item.kind === 'earnings');
    expect(earnings?.symbol).toBe('NVDA.US');
    expect(earnings?.sourceId ?? null).toBeNull();
  });
});
