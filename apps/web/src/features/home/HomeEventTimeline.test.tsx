// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventSourceStatus } from '@kansoku/core/contract/events';
import type { MarketEvent } from '@kansoku/shared/types';
import type { MarketEventFeedState } from '../events/useMarketEventFeed';

const feedCalls: { symbol?: string; live?: boolean; limit?: number }[] = [];
const healthCalls: boolean[] = [];

let feedState: MarketEventFeedState;
let healthSources: EventSourceStatus[] | null = [];

vi.mock('../events/useMarketEventFeed', () => ({
  useMarketEventFeed: (options: { symbol?: string; live?: boolean; limit?: number }) => {
    feedCalls.push(options);
    return feedState;
  },
}));
vi.mock('../events/useEventSourceHealth', () => ({
  useEventSourceHealth: (enabled: boolean) => {
    healthCalls.push(enabled);
    return { sources: healthSources, error: null, loading: false };
  },
}));

const { HOME_EVENT_VISIBLE, HomeEventTimeline } = await import('./HomeEventTimeline');

function evt(id: string, occurredAt: string): MarketEvent {
  return {
    id,
    dedupeKey: `k-${id}`,
    clusterId: `c-${id}`,
    source: 'sec-edgar',
    class: 'filing',
    kind: '8-K',
    symbols: ['MU.US'],
    occurredAt,
    observedAt: occurredAt,
    trust: 'official',
    severity: 'notable',
    payload: { title: `头条 ${id}` },
    canvasSlug: null,
  };
}

beforeEach(() => {
  feedCalls.length = 0;
  healthCalls.length = 0;
  healthSources = [];
  feedState = {
    events: [],
    status: 'ready',
    error: null,
    loadingMore: false,
    moreError: null,
    exhausted: true,
    loadMore: vi.fn(async () => {}),
  };
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-01T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('HomeEventTimeline', () => {
  it('shows only events that have already happened', () => {
    feedState.events = [
      evt('future', '2026-08-01T13:00:00.000Z'),
      evt('past', '2026-08-01T11:00:00.000Z'),
    ];
    render(<HomeEventTimeline live />);
    expect(screen.getByRole('heading', { level: 4, name: '头条 past' })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 4, name: '头条 future' })).toBeNull();
  });

  it('defaults to a short recent window rather than the whole tape', () => {
    feedState.events = Array.from({ length: HOME_EVENT_VISIBLE + 4 }, (_, i) =>
      evt(`e${i}`, '2026-08-01T10:00:00.000Z'),
    );
    render(<HomeEventTimeline live />);
    expect(screen.getAllByRole('heading', { level: 4 })).toHaveLength(HOME_EVENT_VISIBLE);
  });

  it('puts source health next to the timeline', () => {
    healthSources = [
      {
        source: 'sec-edgar',
        health: 'active',
        cursor: null,
        failureStreak: 0,
        lastPolledAt: '2026-08-01T11:59:00.000Z',
        lastEventAt: null,
        lastError: null,
        disabledReason: null,
        nextAttemptAt: null,
        updatedAt: '2026-08-01T11:59:00.000Z',
      },
    ];
    render(<HomeEventTimeline live />);
    expect(screen.getByRole('group', { name: '事件来源状态' })).toBeTruthy();
  });

  it('does not open a live subscription while reviewing a past day', () => {
    render(<HomeEventTimeline live={false} />);
    expect(feedCalls.at(-1)?.live).toBe(false);
    expect(healthCalls.at(-1)).toBe(false);
  });

  it('says the tape is quiet instead of showing nothing at all', () => {
    feedState.status = 'empty';
    render(<HomeEventTimeline live />);
    expect(screen.getByText('今天还没有已发生的市场事件')).toBeTruthy();
  });
});
