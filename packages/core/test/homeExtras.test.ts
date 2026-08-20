import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketDataProvider } from '../src/marketdata/types.js';
import {
  buildHomeExtras,
  flowEligible,
  homeExtrasWarm,
  netInflow,
  onHomeExtrasChange,
  resetHomeExtrasForTests,
} from '../src/overview/homeExtras.js';

const provider: Partial<MarketDataProvider> = {};

vi.mock('../src/marketdata/registry.js', () => ({
  getProvider: () => provider,
}));

beforeEach(() => {
  resetHomeExtrasForTests();
  provider.getFlow = vi.fn(async () => [
    { time: 't1', inflow: '100.5' },
    { time: 't2', inflow: -40 },
    { time: 't3', inflow: 'not-a-number' },
  ]);
  provider.getQuotes = vi.fn(async (symbols: string[]) =>
    symbols.map((symbol) => ({
      symbol,
      last: '100',
      prev_close: '98',
      change_percentage: '2.04',
    })),
  );
  provider.getWatchlistSymbols = vi.fn(async () => ['NVDA.US', 'MU.US']);
  provider.getPositions = vi.fn(async () => [
    {
      symbol: 'MU.US',
      available: '1',
      cost_price: '1',
      currency: 'USD',
      market: 'US',
      name: 'MU',
      quantity: '1',
    },
  ]);
  provider.getMarketTemp = vi.fn(async () => ({
    temperature: 57,
    valuation: 82,
    sentiment: 32,
    description: 'Comfortable',
  }));
});

describe('flowEligible', () => {
  it('skips indices and option contracts', () => {
    expect(flowEligible('NVDA.US')).toBe(true);
    expect(flowEligible('.IXIC')).toBe(false);
    expect(flowEligible('DRAM260724C69000.US')).toBe(false);
  });
});

describe('netInflow', () => {
  it('sums numeric inflows and skips unparsable rows', () => {
    expect(netInflow([{ time: 'a', inflow: '1.5' }, { time: 'b', inflow: 2 }])).toBeCloseTo(3.5);
    expect(netInflow([{ time: 'a', inflow: 'x' }])).toBe(0);
  });
});

describe('buildHomeExtras', () => {
  it('returns the first extras frame without waiting for symbol flows', async () => {
    let blocked = true;
    let unlock!: () => void;
    const gate = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    provider.getFlow = vi.fn(async () => {
      if (blocked) await gate;
      return [{ time: 't', inflow: '1' }];
    });
    const extras = await Promise.race([
      buildHomeExtras(['TSM.US']),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('first extras frame blocked on flows')), 50);
      }),
    ]);
    expect(extras.flows['TSM.US']).toBeNull();
    expect(extras.market).toMatchObject({ temperature: 57 });
    blocked = false;
    unlock();
    await homeExtrasWarm();
  });

  it('aggregates flows for watch symbols plus extras and market temp', async () => {
    await buildHomeExtras(['TSM.US']);
    await homeExtrasWarm();
    const extras = await buildHomeExtras(['TSM.US']);
    expect(Object.keys(extras.flows)).toEqual(
      expect.arrayContaining(['NVDA.US', 'MU.US', 'TSM.US']),
    );
    expect(extras.flows['NVDA.US']).toBeCloseTo(60.5);
    expect(extras.flows_at).not.toBeNull();
    expect(extras.market).toMatchObject({ temperature: 57, valuation: 82 });
  });

  it('notifies listeners after background flows land', async () => {
    const saw = vi.fn();
    const stop = onHomeExtrasChange(saw);
    await buildHomeExtras([]);
    expect(saw).not.toHaveBeenCalled();
    await homeExtrasWarm();
    expect(saw).toHaveBeenCalledTimes(1);
    stop();
  });

  it('caches flow results within the TTL', async () => {
    await buildHomeExtras([]);
    await homeExtrasWarm();
    const calls = (provider.getFlow as ReturnType<typeof vi.fn>).mock.calls.length;
    await buildHomeExtras([]);
    await homeExtrasWarm();
    expect((provider.getFlow as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls);
  });

  it('degrades to nulls when every source fails', async () => {
    provider.getFlow = vi.fn(async () => {
      throw new Error('boom');
    });
    provider.getMarketTemp = vi.fn(async () => {
      throw new Error('boom');
    });
    const extras = await buildHomeExtras([]);
    await homeExtrasWarm();
    const filled = await buildHomeExtras([]);
    expect(filled.flows['NVDA.US']).toBeNull();
    expect(filled.flows_at).toBeNull();
    expect(extras.market).toBeNull();
  });

  it('fetches symbol flows one at a time so homepage boot does not burst the quote quota', async () => {
    let inflight = 0;
    let peak = 0;
    provider.getFlow = vi.fn(async () => {
      inflight += 1;
      peak = Math.max(peak, inflight);
      await Promise.resolve();
      inflight -= 1;
      return [{ time: 't', inflow: '1' }];
    });
    await buildHomeExtras(['TSM.US', 'AAPL.US']);
    await homeExtrasWarm();
    expect(peak).toBe(1);
    expect(provider.getFlow).toHaveBeenCalledTimes(4);
  });

  it('waits for flows to finish before calling market caps', async () => {
    const order: string[] = [];
    provider.getFlow = vi.fn(async () => {
      order.push('flow');
      return [{ time: 't', inflow: '1' }];
    });
    provider.getMarketCaps = vi.fn(async () => {
      order.push('caps');
      return { 'NVDA.US': 1 };
    });
    await buildHomeExtras([]);
    await homeExtrasWarm();
    expect(order.indexOf('caps')).toBeGreaterThan(order.lastIndexOf('flow'));
  });
});
