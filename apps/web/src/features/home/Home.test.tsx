// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OverviewBoard, SessionKind } from '@kansoku/shared/types';
import { marketDate } from '@kansoku/shared/time';

let boardData: OverviewBoard | null = null;

vi.mock('../../lib/ws/useWsChannel', async () => {
  const { useEffect } = await import('react');
  return {
    useWsChannel: (spec: { kind: string } | null, onData: (data: unknown) => void) => {
      const kind = spec?.kind ?? null;
      useEffect(() => {
        if (kind === 'board' && boardData) onData(boardData);
        if (kind === 'quotes') onData({ ts: Date.now(), quotes: [] });
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [kind]);
      return { degraded: false, connected: true, snapshotAt: null };
    },
  };
});
vi.mock('../../lib/client', () => ({
  client: {
    overview: {
      events: vi.fn(async () => ({ date: marketDate(), items: [] })),
      recapDates: vi.fn(async () => []),
    },
    charts: { list: vi.fn(async () => []) },
    positions: {
      list: vi.fn(async () => ({
        currency: 'USD',
        total_asset: 110,
        market_cap: 100,
        cash: 10,
        total_pl: 5,
        today_pl: 1,
        positions: [
          {
            symbol: 'NVDA.US',
            name: 'NVIDIA',
            quantity: 1,
            cost_price: 95,
            last: 100,
            market_value: 100,
            pnl: 5,
            pnl_pct: 5.26,
          },
        ],
      })),
    },
    capabilities: { get: vi.fn(async () => ({ features: {} })) },
  },
}));
vi.mock('../../lib/portTransport', () => ({ isDesktopRealtime: () => true }));
vi.mock('./RecapBoard', () => ({
  RecapBoard: ({ defaultExpanded }: { defaultExpanded: boolean }) => (
    <div>recap-board:{String(defaultExpanded)}</div>
  ),
}));
vi.mock('./CrossSectionCharts', () => ({
  CROSS_SECTION_TYPES: 'flow,cohort',
  CrossSectionCharts: () => <div>cross-section</div>,
}));
vi.mock('./SymbolGrid', () => ({ SymbolGrid: () => <div>symbol-grid</div> }));
vi.mock('./WatchBoard', () => ({ WatchBoard: () => <div>watch-strip</div> }));
vi.mock('./PositionsCard', () => ({ PositionsCard: () => <div>positions-card</div> }));
vi.mock('./MarketPanorama', () => ({ MarketPanorama: () => <div>market-panorama</div> }));
vi.mock('../events/EventCanvasHost', () => ({
  EventCanvasHost: ({ children }: { children: import('react').ReactNode }) => children,
}));
vi.mock('./EventCalendar', () => ({ EventCalendar: () => <div>event-calendar</div> }));
vi.mock('./HomeEventTimeline', () => ({
  HomeEventTimeline: ({ live }: { live: boolean }) => (
    <div>home-event-timeline:{String(live)}</div>
  ),
}));

const { Home } = await import('./Home');

function renderHome(session: SessionKind) {
  boardData = { date: marketDate(), session, rows: [] };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Home />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  boardData = null;
  window.history.replaceState(null, '', '/');
  window.dispatchEvent(new PopStateEvent('popstate'));
});

async function expectPositionsBeforeCalendar() {
  const positions = await screen.findByText('positions-card');
  const calendar = screen.getByText('event-calendar');
  expect(positions.compareDocumentPosition(calendar) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

describe('Home session layouts', () => {
  it('pre-market: overnight grid main, events and positions in the rail, no recap', async () => {
    renderHome('pre');
    expect(await screen.findByText('symbol-grid')).toBeTruthy();
    expect(screen.getByText(/隔夜行情/)).toBeTruthy();
    expect(screen.getByText('market-panorama')).toBeTruthy();
    expect(screen.getByText('event-calendar')).toBeTruthy();
    await expectPositionsBeforeCalendar();
    expect(screen.queryByText(/recap-board/)).toBeNull();
  });

  it('regular session: watch grid main, positions and calendar in the rail, no recap in sidebar', async () => {
    renderHome('regular');
    const symbolGrid = await screen.findByText('symbol-grid');
    expect(symbolGrid.closest('.home-main-scroll')).toBeNull();
    expect(symbolGrid.closest('.home-page')).toBeTruthy();
    expect(screen.getByText(/看盘 · 自选 \+ 持仓/)).toBeTruthy();
    expect(screen.getByText('positions-card').closest('.home-side-scroll')).toBeTruthy();
    expect(screen.getByText('event-calendar')).toBeTruthy();
    await expectPositionsBeforeCalendar();
    expect(screen.queryByText(/recap-board/)).toBeNull();
  });

  it('post session: expanded recap main, close-freeze strip and events in the rail', async () => {
    renderHome('post');
    expect(await screen.findByText('recap-board:true')).toBeTruthy();
    expect(screen.getByText('watch-strip')).toBeTruthy();
    expect(screen.getByText(/收盘定格/)).toBeTruthy();
    await expectPositionsBeforeCalendar();
    expect(screen.queryByText('symbol-grid')).toBeNull();
  });
});

describe('Home market event tape', () => {
  it('puts the occurred timeline under the calendar inside the same event block', async () => {
    renderHome('regular');
    const calendar = await screen.findByText('event-calendar');
    const timeline = screen.getByText('home-event-timeline:true');
    expect(screen.getByText('已发生')).toBeTruthy();
    expect(calendar.compareDocumentPosition(timeline) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('does not mount the live tape while reviewing a past day', async () => {
    window.history.replaceState(null, '', '/?date=2020-01-02');
    window.dispatchEvent(new PopStateEvent('popstate'));
    renderHome('post');
    expect(await screen.findByText('recap-board:true')).toBeTruthy();
    expect(screen.queryByText(/home-event-timeline/)).toBeNull();
  });
});
