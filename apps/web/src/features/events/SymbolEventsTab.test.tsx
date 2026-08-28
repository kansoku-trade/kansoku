// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketEvent } from '@kansoku/shared/types';
import type { MarketEventFeedState } from './useMarketEventFeed';

const feedCalls: { symbol?: string; live?: boolean }[] = [];
let feedState: MarketEventFeedState;

vi.mock('./useMarketEventFeed', () => ({
  useMarketEventFeed: (options: { symbol?: string; live?: boolean }) => {
    feedCalls.push(options);
    return feedState;
  },
}));

const { SymbolEventsTab } = await import('./SymbolEventsTab');

const event: MarketEvent = {
  id: 'evt-1',
  dedupeKey: 'k1',
  clusterId: 'c1',
  source: 'sec-edgar',
  class: 'filing',
  kind: '8-K',
  symbols: ['MU.US'],
  occurredAt: '2026-08-01T14:30:00.000Z',
  observedAt: '2026-08-01T14:31:00.000Z',
  trust: 'official',
  severity: 'critical',
  payload: { title: 'Micron 提交 8-K' },
  canvasSlug: null,
};

beforeEach(() => {
  feedCalls.length = 0;
  feedState = {
    events: [],
    status: 'ready',
    error: null,
    loadingMore: false,
    moreError: null,
    exhausted: true,
    loadMore: vi.fn(async () => {}),
  };
});

afterEach(() => cleanup());

describe('SymbolEventsTab', () => {
  it('asks for a live feed filtered to the open symbol', () => {
    render(<SymbolEventsTab symbol="MU.US" />);
    expect(feedCalls.at(-1)).toEqual({ symbol: 'MU.US', live: true });
  });

  it('renders the same market event card the home tape uses', () => {
    feedState.events = [event];
    render(<SymbolEventsTab symbol="MU.US" />);
    expect(screen.getByRole('heading', { level: 4, name: 'Micron 提交 8-K' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '生成事件画布：Micron 提交 8-K' })).toBeTruthy();
  });

  it('names the symbol in the empty state', () => {
    feedState.status = 'empty';
    render(<SymbolEventsTab symbol="MU.US" />);
    expect(screen.getByText('MU 还没有采集到事件')).toBeTruthy();
  });
});
