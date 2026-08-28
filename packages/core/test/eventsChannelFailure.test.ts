import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketEvent } from '@kansoku/shared/types';

const store = vi.hoisted(() => ({ listEvents: vi.fn() }));
vi.mock('../src/events/store.js', () => store);

const { marketEventListenerCount, publishMarketEvent } = await import('../src/events/bus.js');
const { subscribeEvents } = await import('../src/realtime/events.js');

function event(id: string): MarketEvent {
  return {
    id,
    dedupeKey: `k-${id}`,
    clusterId: id,
    source: 'sec-edgar',
    class: 'filing',
    kind: 'form-4',
    symbols: ['NVDA.US'],
    occurredAt: '2026-08-20T13:00:00.000Z',
    observedAt: '2026-08-20T13:00:10.000Z',
    trust: 'official',
    severity: 'notable',
    payload: { title: `事件 ${id}` },
    canvasSlug: null,
  };
}

beforeEach(() => {
  store.listEvents.mockReset();
});

describe('subscribeEvents failure handling', () => {
  it('detaches its listener when the snapshot query fails', async () => {
    store.listEvents.mockRejectedValue(new Error('database is down'));
    const before = marketEventListenerCount();
    const sent: string[] = [];

    await expect(subscribeEvents(null, (raw) => sent.push(raw))).rejects.toThrow(
      /database is down/,
    );

    // A subscriber that never got its snapshot must not be left on the bus quietly
    // buffering every event for the rest of the process' life.
    expect(marketEventListenerCount()).toBe(before);
    publishMarketEvent(event('after-failure'));
    expect(sent).toEqual([]);
  });

  it('detaches its listener when the initial push fails', async () => {
    store.listEvents.mockResolvedValue([]);
    const before = marketEventListenerCount();
    let calls = 0;
    const push = (): void => {
      calls += 1;
      throw new Error('socket already closed');
    };

    await expect(subscribeEvents(null, push)).rejects.toThrow(/socket already closed/);
    expect(calls).toBe(1);
    expect(marketEventListenerCount()).toBe(before);

    publishMarketEvent(event('after-failure'));
    expect(calls).toBe(1);
  });

  it('drops events buffered during the snapshot when the flush fails', async () => {
    let buffered: MarketEvent | undefined;
    store.listEvents.mockImplementation(async () => {
      // Arrives while the snapshot is still in flight, so it lands in the buffer.
      buffered = event('during-snapshot');
      publishMarketEvent(buffered);
      return [];
    });
    const sent: string[] = [];
    const push = (raw: string): void => {
      sent.push(raw);
      if (sent.length === 2) throw new Error('socket already closed');
    };

    await expect(subscribeEvents(null, push)).rejects.toThrow(/socket already closed/);
    expect(buffered).toBeDefined();
    expect(sent).toHaveLength(2);
    expect(marketEventListenerCount()).toBe(0);

    publishMarketEvent(event('after-failure'));
    expect(sent).toHaveLength(2);
  });
});
