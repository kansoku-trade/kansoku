import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuoteCell } from '@kansoku/shared/types';
import type { QuoteStream } from '../src/marketdata/quoteStream.js';
import type { MarketDataProvider } from '../src/marketdata/types.js';

interface FakeStream extends QuoteStream {
  emit(cell: QuoteCell): void;
}

function fakeStream(): FakeStream {
  const listeners = new Set<(cell: QuoteCell) => void>();
  const snapshots = new Map<string, QuoteCell>();
  return {
    retain: vi.fn(async () => {}),
    release: vi.fn(async () => {}),
    subscribeCandlesticks: vi.fn(() => () => {}),
    onUpdate: vi.fn((l: (cell: QuoteCell) => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    }),
    getSnapshot: vi.fn((s: string) => snapshots.get(s)),
    emit(cell: QuoteCell) {
      snapshots.set(cell.symbol, cell);
      for (const l of listeners) l(cell);
    },
  };
}

const provider: Partial<MarketDataProvider> = {};
let streams: Record<string, FakeStream>;
const routing = { cb: null as (() => void) | null };

vi.mock('../src/marketdata/registry.js', () => ({
  getProvider: () => provider,
  getStream: (market: string) => streams[market],
  onProviderRoutingChanged: (cb: () => void) => {
    routing.cb = cb;
    return () => {
      routing.cb = null;
    };
  },
}));

function cell(symbol: string, last: number): QuoteCell {
  return { symbol, session: '日盘', last, pct: 0, regularLast: last, regularPct: 0 };
}

describe('subscribeQuotes re-wires the stream on a provider routing change', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    streams = { US: fakeStream(), HK: fakeStream(), CN: fakeStream() };
    provider.getPositions = undefined;
    provider.getWatchlistSymbols = vi.fn(async () => ['MU.US']);
    provider.getQuotes = vi.fn(async () => []);
    routing.cb = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('drops the dead stream, re-retains the same symbols on the fresh one, and keeps serving updates', async () => {
    const { subscribeQuotes } = await import('../src/realtime/quotes.js');
    const pushes: string[] = [];
    const unsubscribe = subscribeQuotes((env) => pushes.push(env));
    try {
      await vi.advanceTimersByTimeAsync(0);
      const yahoo = streams.US;
      expect(yahoo.retain).toHaveBeenCalledWith(['MU.US']);
      expect(yahoo.onUpdate).toHaveBeenCalled();

      yahoo.emit(cell('MU.US', 100));
      await vi.advanceTimersByTimeAsync(300);
      const beforeFlip = pushes.length;
      expect(beforeFlip).toBeGreaterThan(0);
      expect(pushes.at(-1)).toContain('"last":100');

      const longbridge = fakeStream();
      streams.US = longbridge;
      routing.cb?.();
      await vi.advanceTimersByTimeAsync(300);

      expect(longbridge.retain).toHaveBeenCalledWith(['MU.US']);
      expect(longbridge.onUpdate).toHaveBeenCalled();

      const afterRewire = pushes.length;
      yahoo.emit(cell('MU.US', 999));
      await vi.advanceTimersByTimeAsync(300);
      expect(pushes.length).toBe(afterRewire);

      longbridge.emit(cell('MU.US', 123));
      await vi.advanceTimersByTimeAsync(300);
      expect(pushes.length).toBeGreaterThan(afterRewire);
      expect(pushes.at(-1)).toContain('"last":123');
    } finally {
      unsubscribe();
    }
  });
});
