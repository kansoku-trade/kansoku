// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IntradaySidebar } from '@kansoku/shared/types';

vi.mock('./AiTab', () => ({ AiTab: () => <div>ai-tab</div> }));
vi.mock('./EnvTab', () => ({ EnvTab: () => <div>env-tab</div> }));
vi.mock('./FlowTab', () => ({ FlowTab: () => <div>flow-tab</div> }));
vi.mock('./ReviewTab', () => ({ ReviewTab: () => <div>review-tab</div> }));
vi.mock('@web/features/charts/intraday/tabs/NewsTab', () => ({
  NewsTab: () => <div>news-tab</div>,
}));
vi.mock('../events/SymbolEventsTab', () => ({
  SymbolEventsTab: ({ symbol }: { symbol: string }) => <div>symbol-events:{symbol}</div>,
}));

const { buildSharedSidebarTabs } = await import('./sharedSidebarTabs');

function tabs(sym = 'MU.US') {
  return buildSharedSidebarTabs({
    sym,
    sidebar: {} as IntradaySidebar,
    env: {
      position: null,
      positionError: null,
      benchmark: null,
      benchmarkError: null,
      relvol: null,
    } as never,
    analysesRows: [],
    latestId: null,
    journalEntries: [],
    reloadJournal: () => {},
    reviewSection: 'history',
    setReviewSection: () => {},
    selectedJournal: null,
    setSelectedJournal: () => {},
    comments: [],
    commentsError: null,
    commentsLoaded: true,
    unread: 0,
  });
}

afterEach(() => cleanup());

describe('buildSharedSidebarTabs', () => {
  it('adds an events tab without dropping the existing ones', () => {
    const keys = tabs().map((tab) => tab.key);
    expect(keys).toContain('events');
    expect(keys).toEqual(expect.arrayContaining(['env', 'news', 'review', 'ai']));
  });

  it('labels the events tab and filters it to the open symbol', () => {
    const eventsTab = tabs().find((tab) => tab.key === 'events');
    expect(eventsTab?.label).toBe('事件');
    render(<div>{eventsTab?.content}</div>);
    expect(screen.getByText('symbol-events:MU.US')).toBeTruthy();
  });
});
