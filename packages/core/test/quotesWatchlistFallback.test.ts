import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuoteStream } from '../src/marketdata/quoteStream.js';
import type { MarketDataProvider } from '../src/marketdata/types.js';

const provider: Partial<MarketDataProvider> = {};

function fakeStream(): QuoteStream {
  return {
    retain: vi.fn(async () => {}),
    release: vi.fn(async () => {}),
    subscribeCandlesticks: vi.fn(() => () => {}),
    onUpdate: vi.fn(() => () => {}),
    getSnapshot: vi.fn(() => undefined),
  };
}

let streams: Record<string, QuoteStream>;

vi.mock('../src/marketdata/registry.js', () => ({
  getProvider: () => provider,
  getStream: (market: string) => streams[market],
  onProviderRoutingChanged: () => () => {},
}));

function flush(ms = 30): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('subscribeQuotes falls back to the local watchlist', () => {
  let dbDir: string;

  beforeEach(() => {
    vi.resetModules();
    streams = { US: fakeStream(), HK: fakeStream(), CN: fakeStream() };
    provider.getPositions = undefined;
    provider.getWatchlistSymbols = undefined;
    provider.getQuotes = vi.fn(async () => []);
  });

  afterEach(() => {
    if (dbDir) rmSync(dbDir, { recursive: true, force: true });
  });

  it('retains local-watchlist symbols when the active provider has no getWatchlistSymbols', async () => {
    dbDir = mkdtempSync(join(tmpdir(), 'quotes-local-watchlist-'));
    const { createDb } = await import('../src/db/index.js');
    const { createLocalWatchlistStore, setActiveLocalWatchlistStore } = await import(
      '../src/marketdata/localWatchlistStore.js'
    );
    const store = createLocalWatchlistStore(createDb(join(dbDir, 'app.db')));
    store.set(['NVDA', 'MU']);
    setActiveLocalWatchlistStore(store);

    const { subscribeQuotes } = await import('../src/realtime/quotes.js');
    const unsubscribe = subscribeQuotes(() => {});
    try {
      await flush();
      expect(streams.US.retain).toHaveBeenCalledWith(['NVDA.US', 'MU.US']);
    } finally {
      unsubscribe();
    }
  });
});
