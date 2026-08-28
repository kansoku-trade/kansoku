// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventListInput } from '@kansoku/core/contract/events';
import type { MarketEvent } from '@kansoku/shared/types';

interface FakeSub {
  spec: { kind: string; symbol?: string };
  onPayload: (payload: unknown) => void;
  onConnected: (connected: boolean) => void;
}

const subs: FakeSub[] = [];
const unsubscribe = vi.fn();

vi.mock('@web/lib/ws/wsHub', () => ({
  subscribeChannel: (
    spec: FakeSub['spec'],
    onPayload: FakeSub['onPayload'],
    onConnected: FakeSub['onConnected'],
  ) => {
    subs.push({ spec, onPayload, onConnected });
    return unsubscribe;
  },
}));

const listEvents = vi.fn<(input: EventListInput) => Promise<MarketEvent[]>>(async () => []);
vi.mock('@web/lib/client', () => ({
  client: { events: { list: (input: EventListInput) => listEvents(input) } },
}));

const { useMarketEventFeed } = await import('./useMarketEventFeed');

function evt(id: string, occurredAt: string, over: Partial<MarketEvent> = {}): MarketEvent {
  return {
    id,
    dedupeKey: `k-${id}`,
    clusterId: `c-${id}`,
    source: 'sec',
    class: 'filing',
    kind: '8-K',
    symbols: ['MU.US'],
    occurredAt,
    observedAt: occurredAt,
    trust: 'official',
    severity: 'notable',
    payload: { title: `title-${id}` },
    canvasSlug: null,
    ...over,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  subs.length = 0;
  unsubscribe.mockClear();
  listEvents.mockReset();
  listEvents.mockResolvedValue([]);
});

afterEach(() => cleanup());

describe('useMarketEventFeed', () => {
  it('subscribes to the unfiltered events channel for the home feed', async () => {
    renderHook(() => useMarketEventFeed({ live: true }), { wrapper });
    await waitFor(() => expect(subs).toHaveLength(1));
    expect(subs[0].spec).toEqual({ kind: 'events' });
  });

  it('passes the symbol through so the channel is filtered server-side', async () => {
    renderHook(() => useMarketEventFeed({ symbol: 'MU.US', live: true }), { wrapper });
    await waitFor(() => expect(subs).toHaveLength(1));
    expect(subs[0].spec).toEqual({ kind: 'events', symbol: 'MU.US' });
    expect(listEvents).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'MU.US' }));
  });

  it('does not open a realtime channel for a historical review', async () => {
    renderHook(() => useMarketEventFeed({ live: false }), { wrapper });
    await waitFor(() => expect(listEvents).toHaveBeenCalled());
    expect(subs).toHaveLength(0);
  });

  it('merges the init snapshot with later live events, newest first', async () => {
    const { result } = renderHook(() => useMarketEventFeed({ live: true }), { wrapper });
    await waitFor(() => expect(subs).toHaveLength(1));

    act(() => {
      subs[0].onPayload({
        type: 'init',
        events: [evt('a', '2026-08-01T10:00:00.000Z'), evt('b', '2026-08-01T09:00:00.000Z')],
      });
    });
    act(() => {
      subs[0].onPayload({ type: 'event', event: evt('c', '2026-08-01T11:00:00.000Z') });
    });

    await waitFor(() => expect(result.current.events.map((e) => e.id)).toEqual(['c', 'a', 'b']));
    expect(result.current.status).toBe('ready');
  });

  it('updates in place when a cluster resends the same id', async () => {
    const { result } = renderHook(() => useMarketEventFeed({ live: true }), { wrapper });
    await waitFor(() => expect(subs).toHaveLength(1));

    act(() => {
      subs[0].onPayload({ type: 'init', events: [evt('a', '2026-08-01T10:00:00.000Z')] });
    });
    act(() => {
      subs[0].onPayload({
        type: 'event',
        event: evt('a', '2026-08-01T10:00:00.000Z', { severity: 'critical' }),
      });
    });

    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(result.current.events[0].severity).toBe('critical');
  });

  it('reports loading first and empty once an empty snapshot arrives', async () => {
    const { result } = renderHook(() => useMarketEventFeed({ live: true }), { wrapper });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(subs).toHaveLength(1));
    act(() => {
      subs[0].onPayload({ type: 'init', events: [] });
    });
    await waitFor(() => expect(result.current.status).toBe('empty'));
  });

  it('reports degraded when the channel refuses to attach', async () => {
    const { result } = renderHook(() => useMarketEventFeed({ live: true }), { wrapper });
    await waitFor(() => expect(subs).toHaveLength(1));
    act(() => {
      subs[0].onPayload({ type: 'status', degraded: true, error: 'store offline' });
    });
    await waitFor(() => expect(result.current.status).toBe('degraded'));
    expect(result.current.error).toBe('store offline');
  });

  it('reports degraded after an established connection drops', async () => {
    const { result } = renderHook(() => useMarketEventFeed({ live: true }), { wrapper });
    await waitFor(() => expect(subs).toHaveLength(1));
    act(() => {
      subs[0].onConnected(true);
      subs[0].onPayload({ type: 'init', events: [evt('a', '2026-08-01T10:00:00.000Z')] });
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => subs[0].onConnected(false));
    await waitFor(() => expect(result.current.status).toBe('degraded'));
    expect(result.current.events).toHaveLength(1);
  });

  it('surfaces an initial HTTP failure as degraded', async () => {
    listEvents.mockRejectedValue(new Error('list blew up'));
    const { result } = renderHook(() => useMarketEventFeed({ live: false }), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('degraded'));
    expect(result.current.error).toBe('list blew up');
  });

  it('pages older events with a keyset cursor taken from the oldest row', async () => {
    listEvents.mockResolvedValueOnce([
      evt('a', '2026-08-01T10:00:00.000Z'),
      evt('b', '2026-08-01T09:00:00.000Z'),
    ]);
    const { result } = renderHook(() => useMarketEventFeed({ live: false }), { wrapper });
    await waitFor(() => expect(result.current.events).toHaveLength(2));

    listEvents.mockResolvedValueOnce([evt('c', '2026-08-01T08:00:00.000Z')]);
    await act(async () => {
      await result.current.loadMore();
    });

    expect(listEvents).toHaveBeenLastCalledWith(
      expect.objectContaining({ before: '2026-08-01T09:00:00.000Z', beforeId: 'b' }),
    );
    await waitFor(() => expect(result.current.events.map((e) => e.id)).toEqual(['a', 'b', 'c']));
  });
});
