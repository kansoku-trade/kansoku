import { useCallback, useEffect, useRef, useState } from 'react';
import type { MarketEvent } from '@kansoku/shared/types';
import { errorMessage } from '@web/lib/api';
import { useQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';
import { subscribeChannel } from '@web/lib/ws/wsHub';
import { EVENT_FEED_LIMIT, mergeMarketEvents } from './eventFeed';

export type MarketEventFeedStatus = 'loading' | 'degraded' | 'empty' | 'ready';

export interface MarketEventFeedState {
  events: MarketEvent[];
  status: MarketEventFeedStatus;
  error: string | null;
  loadingMore: boolean;
  moreError: string | null;
  exhausted: boolean;
  loadMore: () => Promise<void>;
}

interface EventEnvelope {
  type: 'init' | 'event' | 'status';
  events?: MarketEvent[];
  event?: MarketEvent;
  degraded?: boolean;
  error?: string;
}

const PAGE_SIZE = 30;

export function useMarketEventFeed({
  symbol,
  live = true,
  limit = PAGE_SIZE,
}: {
  symbol?: string;
  live?: boolean;
  limit?: number;
}): MarketEventFeedState {
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [streamReady, setStreamReady] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [dropped, setDropped] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const connectedOnce = useRef(false);

  const {
    data: firstPage,
    error: httpError,
    loading,
  } = useQuery<MarketEvent[]>(`events.list:${symbol ?? '*'}:${limit}`, () =>
    client.events.list({ ...(symbol ? { symbol } : {}), limit }),
  );

  useEffect(() => {
    setEvents([]);
    setStreamReady(false);
    setStreamError(null);
    setDropped(false);
    setMoreError(null);
    setExhausted(false);
  }, [symbol]);

  useEffect(() => {
    if (firstPage) setEvents((prev) => mergeMarketEvents(prev, firstPage));
  }, [firstPage]);

  useEffect(() => {
    if (!live) return;
    connectedOnce.current = false;
    return subscribeChannel(
      { kind: 'events', ...(symbol ? { symbol } : {}) },
      (payload) => {
        const envelope = payload as EventEnvelope;
        if (envelope.type === 'init') {
          const snapshot = envelope.events ?? [];
          setStreamError(null);
          setEvents((prev) => mergeMarketEvents(prev, snapshot));
          setStreamReady(true);
        } else if (envelope.type === 'event' && envelope.event) {
          const incoming = envelope.event;
          setEvents((prev) => mergeMarketEvents(prev, [incoming]));
        } else if (envelope.type === 'status' && envelope.degraded) {
          setStreamError(envelope.error ?? '事件流连接失败');
        }
      },
      (connected) => {
        if (connected) {
          connectedOnce.current = true;
          setDropped(false);
          // A reconnect replays the snapshot, so the previous failure is stale.
          setStreamError(null);
        } else if (connectedOnce.current) {
          setDropped(true);
        }
      },
    );
  }, [symbol, live]);

  const loadMore = useCallback(async () => {
    const oldest = events.at(-1);
    if (!oldest || loadingMore) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const older = await client.events.list({
        ...(symbol ? { symbol } : {}),
        limit,
        before: oldest.occurredAt,
        beforeId: oldest.id,
      });
      setEvents((prev) => mergeMarketEvents(prev, older, EVENT_FEED_LIMIT));
      if (older.length < limit) setExhausted(true);
    } catch (error) {
      setMoreError(errorMessage(error));
    } finally {
      setLoadingMore(false);
    }
  }, [events, loadingMore, symbol, limit]);

  // A dead socket and an empty tape are different failures, and only the first one
  // means the data on screen is stale.
  const degraded = streamError !== null || dropped || (httpError !== null && !streamReady);
  const settled = streamReady || !loading || events.length > 0;
  const status: MarketEventFeedStatus = degraded
    ? 'degraded'
    : !settled
      ? 'loading'
      : events.length === 0
        ? 'empty'
        : 'ready';

  return {
    events,
    status,
    error: streamError ?? httpError,
    loadingMore,
    moreError,
    exhausted,
    loadMore,
  };
}
