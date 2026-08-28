// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MarketEvent } from '@kansoku/shared/types';
import { MarketEventTape } from './MarketEventTape';
import type { MarketEventFeedState } from './useMarketEventFeed';

afterEach(() => cleanup());

function evt(id: string, occurredAt: string, over: Partial<MarketEvent> = {}): MarketEvent {
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
    ...over,
  };
}

function feed(over: Partial<MarketEventFeedState> = {}): MarketEventFeedState {
  return {
    events: [],
    status: 'ready',
    error: null,
    loadingMore: false,
    moreError: null,
    exhausted: true,
    loadMore: vi.fn(async () => {}),
    ...over,
  };
}

describe('MarketEventTape', () => {
  it('renders one card per event in the order it was given', () => {
    const events = [evt('a', '2026-08-01T12:00:00.000Z'), evt('b', '2026-08-01T11:00:00.000Z')];
    render(<MarketEventTape feed={feed({ events, status: 'ready' })} />);
    const titles = screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent);
    expect(titles).toEqual(['头条 a', '头条 b']);
  });

  it('separates loading from empty', () => {
    const { rerender } = render(<MarketEventTape feed={feed({ status: 'loading' })} />);
    expect(screen.getByText('事件流加载中…')).toBeTruthy();

    rerender(<MarketEventTape feed={feed({ status: 'empty' })} emptyText="今天还没有事件" />);
    expect(screen.getByText('今天还没有事件')).toBeTruthy();
  });

  it('keeps the last synced events on screen behind a degraded banner', () => {
    const events = [evt('a', '2026-08-01T12:00:00.000Z')];
    render(
      <MarketEventTape feed={feed({ events, status: 'degraded', error: 'socket closed' })} />,
    );
    expect(screen.getByText(/事件流已断开/)).toBeTruthy();
    expect(screen.getByText(/socket closed/)).toBeTruthy();
    expect(screen.getByRole('heading', { level: 4, name: '头条 a' })).toBeTruthy();
  });

  it('shows only the first page and reveals the rest on request', () => {
    const events = Array.from({ length: 5 }, (_, i) =>
      evt(`e${i}`, `2026-08-0${i + 1}T00:00:00.000Z`),
    );
    render(<MarketEventTape feed={feed({ events })} initialVisible={2} />);
    expect(screen.getAllByRole('heading', { level: 4 })).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: '显示更多事件' }));
    expect(screen.getAllByRole('heading', { level: 4 })).toHaveLength(4);
  });

  it('asks the server for an older page once the loaded events run out', () => {
    const loadMore = vi.fn(async () => {});
    const events = [evt('a', '2026-08-01T12:00:00.000Z')];
    render(
      <MarketEventTape
        feed={feed({ events, exhausted: false, loadMore })}
        initialVisible={1}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '显示更多事件' }));
    expect(loadMore).toHaveBeenCalled();
  });

  it('hides the more control when everything loaded is already on screen', () => {
    render(<MarketEventTape feed={feed({ events: [evt('a', '2026-08-01T12:00:00.000Z')] })} />);
    expect(screen.queryByRole('button', { name: '显示更多事件' })).toBeNull();
  });

  it('reports a paging failure without hiding what is already on screen', () => {
    const events = [evt('a', '2026-08-01T12:00:00.000Z')];
    render(
      <MarketEventTape
        feed={feed({ events, exhausted: false, moreError: '分页超时' })}
        initialVisible={1}
      />,
    );
    expect(screen.getByText('分页超时')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 4, name: '头条 a' })).toBeTruthy();
  });

  it('forwards the canvas action to every card', () => {
    const onGenerateCanvas = vi.fn();
    const event = evt('a', '2026-08-01T12:00:00.000Z');
    render(
      <MarketEventTape feed={feed({ events: [event] })} onGenerateCanvas={onGenerateCanvas} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '生成事件画布：头条 a' }));
    expect(onGenerateCanvas).toHaveBeenCalledWith(event);
  });
});
