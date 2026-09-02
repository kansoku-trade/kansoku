import { useEffect, useState } from 'react';
import type {
  ChartMeta,
  HomeEvents,
  OverviewBoard,
  PortfolioSummary,
  QuoteSnapshot,
} from '@kansoku/shared/types';
import * as stylex from '@stylexjs/stylex';
import { marketDate } from '@kansoku/shared/time';
import { usePollingQuery, useQuery } from '../../lib/apiHooks';
import { client } from '../../lib/client';
import { navigate, useQueryParam } from '../../lib/router';
import { isDesktopRealtime } from '../../lib/portTransport';
import { DataAgeBadge, ErrorBox, ScrollArea, SectionTitle } from '../../ui';
import { useTitle } from '../../lib/useTitle';
import { useWsChannel } from '../../lib/ws/useWsChannel';
import { useIntervalFetch } from '../cockpit/useIntervalFetch';
import { colors, fontSizes } from '../../theme/tokens.stylex';
import { CROSS_SECTION_TYPES } from './CrossSectionCharts';
import { DateTimeline } from './DateTimeline';
import { EventCanvasHost } from '../events/EventCanvasHost';
import { EventCalendar } from './EventCalendar';
import { HomeEventTimeline } from './HomeEventTimeline';
import { HomeTopStrip, INDEX_SYMBOLS } from './HomeTopStrip';
import { MarketPanorama } from './MarketPanorama';
import { PositionsCard } from './PositionsCard';
import { QuickBar } from './QuickBar';
import { RecapBoard } from './RecapBoard';
import { SymbolGrid } from './SymbolGrid';
import { TrainerCard } from './TrainerCard';
import { WatchBoard } from './WatchBoard';

const styles = stylex.create({
  page: {
    margin: 0,
    maxWidth: 'none',
    padding: 0,
    width: '100%',
  },
  pageViewport: {
    height: 'auto',
  },
  pageContent: {
    margin: '0 auto',
    maxWidth: '1400px',
    padding: '24px 20px 60px',
    width: '100%',
  },
  pageSplit: {
    'width': '100%',
    '@media (min-width: 1001px)': {
      height: '100cqh',
      minHeight: 0,
      overflow: 'hidden',
    },
  },
  pageSplitDesktop: {
    '@media (min-width: 1001px)': {
      height: 'calc(100cqh - 40px)',
    },
  },
  pageSplitViewport: {
    '@media (min-width: 1001px)': {
      height: '100%',
    },
  },
  pageSplitContent: {
    '@media (min-width: 1001px)': {
      paddingBottom: '20px',
    },
  },
  grid: {
    alignItems: 'start',
    display: 'grid',
    gap: '24px',
    gridTemplateColumns: {
      'default': '2fr 1fr',
      '@media (max-width: 1000px)': '1fr',
    },
  },
  side: {
    'height': 'calc(100cqh - 32px)',
    'marginRight': '-8px',
    'position': {
      'default': 'sticky',
      '@media (max-width: 1000px)': 'static',
    },
    'top': '16px',
    '@media (max-width: 1000px)': {
      height: 'auto',
      marginRight: 0,
    },
  },
  sideDesktop: {
    height: 'calc(100cqh - 72px)',
    top: '56px',
  },
  sideContent: {
    paddingRight: {
      'default': '8px',
      '@media (max-width: 1000px)': 0,
    },
  },
  sideScroll: {
    height: {
      'default': '100%',
      '@media (max-width: 1000px)': 'auto',
    },
  },
  sideScrollViewport: {
    '@media (max-width: 1000px)': {
      height: 'auto',
    },
  },
  sideScrollBar: {
    '@media (max-width: 1000px)': {
      display: 'none',
    },
  },
  note: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    lineHeight: 1.4,
    marginTop: '6px',
  },
});

const SESSION_LABEL: Record<string, string> = {
  pre: '盘前',
  regular: '盘中',
  post: '盘后',
  overnight: '休市',
};
const NOTICE_LABEL: Record<string, string> = { 'chart-not-found': '该图表不存在，已为你返回首页' };

function SectionTitleWithAge({ label, at }: { label: string; at: number | null }) {
  return (
    <SectionTitle variant="home" className="section-title--with-age">
      {label}
      <DataAgeBadge at={at} />
    </SectionTitle>
  );
}

export function Home() {
  useTitle(null);
  const noticeParam = useQueryParam('notice');
  const [notice] = useState(noticeParam);
  useEffect(() => {
    if (noticeParam) navigate('/', { replace: true });
  }, [noticeParam]);

  const dateParam = useQueryParam('date');
  const today = marketDate();
  const date = dateParam ?? today;
  const isToday = date === today;
  const desktopRealtime = isDesktopRealtime();

  const [board, setBoard] = useState<OverviewBoard | null>(null);
  const { degraded: boardDegraded, snapshotAt: boardSnapshotAt } = useWsChannel<OverviewBoard>(
    { kind: 'board' },
    setBoard,
  );
  const boardError = boardDegraded ? '盘面数据获取失败，正在重试' : null;

  const [quoteSnap, setQuoteSnap] = useState<QuoteSnapshot | null>(null);
  const { degraded: quotesDegraded, snapshotAt: quotesSnapshotAt } = useWsChannel<QuoteSnapshot>(
    { kind: 'quotes', extra: INDEX_SYMBOLS },
    setQuoteSnap,
  );

  const {
    data: portfolio,
    error: portfolioError,
    dataUpdatedAt: portfolioUpdatedAt,
    refreshed: portfolioRefreshed,
  } = useIntervalFetch<PortfolioSummary>(
    isToday ? 'positions.list' : null,
    () => client.positions.list(),
    60_000,
  );
  const portfolioAgeAt = portfolio != null && !portfolioRefreshed ? portfolioUpdatedAt : null;

  const { data: events, error: eventsError } = usePollingQuery<HomeEvents>(
    isToday ? 'overview.events' : null,
    () => client.overview.events(),
    5 * 60_000,
  );

  const { data: chartMetas } = useQuery<ChartMeta[]>(`charts.list:${CROSS_SECTION_TYPES}`, () =>
    client.charts.list({ type: CROSS_SECTION_TYPES }),
  );
  const { data: recapDates } = useQuery<string[]>('overview.recapDates', () =>
    client.overview.recapDates(),
  );
  const candidateDates = [
    ...new Set([
      today,
      ...(chartMetas ?? []).map((m) => marketDate(m.created_at)),
      ...(recapDates ?? []),
    ]),
  ]
    .sort()
    .reverse();
  const timelineDates = candidateDates.includes(date)
    ? candidateDates
    : [date, ...candidateDates].sort().reverse();

  const session = board?.session ?? null;
  const trading = isToday && (session === 'pre' || session === 'regular');
  const after = isToday && !trading;
  const watching = new Set(board?.rows.map((r) => r.symbol) ?? []);
  const shortcuts = [
    ...new Set([...watching, ...(portfolio?.positions.map((p) => p.symbol) ?? [])]),
  ];

  const flowSection = (
    <>
      <SectionTitleWithAge label="市场全景" at={quotesSnapshotAt} />
      <MarketPanorama
        quotes={quoteSnap?.quotes ?? []}
        portfolio={portfolio ?? null}
        caps={board?.caps ?? {}}
      />
    </>
  );
  const eventSection = (
    <>
      <SectionTitle variant="home">事件日历</SectionTitle>
      <EventCalendar events={events ?? null} error={eventsError} after={after} />
      <SectionTitle variant="home">已发生</SectionTitle>
      <HomeEventTimeline live={isToday} />
    </>
  );
  const positionsSection = (
    <>
      <SectionTitleWithAge label="持仓" at={portfolioAgeAt} />
      <PositionsCard portfolio={portfolio} error={portfolioError} watching={watching} />
    </>
  );
  const hasPositions = (portfolio?.positions.length ?? 0) > 0;
  const hasSplitBoard = isToday && board !== null;

  const recapDate = (recapDates ?? []).find((d) => d < today) ?? null;
  const pageStyle = stylex.props(
    styles.page,
    hasSplitBoard && styles.pageSplit,
    hasSplitBoard && desktopRealtime && styles.pageSplitDesktop,
  );
  const viewportStyle = stylex.props(
    styles.pageViewport,
    hasSplitBoard && styles.pageSplitViewport,
  );
  const contentStyle = stylex.props(styles.pageContent, hasSplitBoard && styles.pageSplitContent);

  return (
    <EventCanvasHost>
      <ScrollArea
        className={`page home-page${hasSplitBoard ? ' home-page--split' : ''} ${pageStyle.className}`}
        viewportClassName={`home-page-viewport ${viewportStyle.className}`}
        contentClassName={`home-page-content ${contentStyle.className}`}
      >
        <HomeTopStrip
          sessionLabel={session ? (SESSION_LABEL[session] ?? session) : null}
          date={isToday ? (board?.date ?? date) : date}
          isToday={isToday}
          quotes={quoteSnap?.quotes ?? []}
          market={board?.market}
          degraded={quotesDegraded}
          snapshotAt={quotesSnapshotAt}
          recapDate={recapDate}
        />
        {notice && NOTICE_LABEL[notice] && <ErrorBox>{NOTICE_LABEL[notice]}</ErrorBox>}
        <QuickBar shortcuts={shortcuts} showGlobalActions={!desktopRealtime} />
        <DateTimeline
          dates={timelineDates}
          selected={date}
          onSelect={(d) => navigate(`/?date=${d}`, { replace: true })}
        />
        {isToday && !board && !boardError && (
          <div className={`note-block ${stylex.props(styles.note).className}`}>盘面加载中…</div>
        )}
        {isToday && boardError && !board && <ErrorBox>{boardError}</ErrorBox>}
        {!isToday && <RecapBoard date={date} defaultExpanded />}
        {isToday && board && trading && (
          <div className={`home-grid ${stylex.props(styles.grid).className}`}>
            <div className="home-main">
              <SectionTitleWithAge
                label={session === 'pre' ? '隔夜行情 · 自选 + 持仓' : '看盘 · 自选 + 持仓'}
                at={boardSnapshotAt}
              />
              <SymbolGrid
                quotes={quoteSnap?.quotes ?? []}
                board={board}
                portfolio={portfolio ?? null}
                events={events ?? null}
              />
              {flowSection}
            </div>
            <div
              className={`home-side ${stylex.props(styles.side, desktopRealtime && styles.sideDesktop).className}`}
            >
              <ScrollArea
                className={`home-side-scroll ${stylex.props(styles.sideScroll).className}`}
                viewportClassName={stylex.props(styles.sideScrollViewport).className}
                scrollbarClassName={stylex.props(styles.sideScrollBar).className}
                contentClassName={`home-side-content ${stylex.props(styles.sideContent).className}`}
              >
                {hasPositions && positionsSection}
                {eventSection}
                {!hasPositions && positionsSection}
                <TrainerCard />
              </ScrollArea>
            </div>
          </div>
        )}
        {isToday && board && after && (
          <div className={`home-grid ${stylex.props(styles.grid).className}`}>
            <div className="home-main">
              <RecapBoard date={date} defaultExpanded />
              {flowSection}
            </div>
            <div
              className={`home-side ${stylex.props(styles.side, desktopRealtime && styles.sideDesktop).className}`}
            >
              <ScrollArea
                className={`home-side-scroll ${stylex.props(styles.sideScroll).className}`}
                viewportClassName={stylex.props(styles.sideScrollViewport).className}
                scrollbarClassName={stylex.props(styles.sideScrollBar).className}
                contentClassName={`home-side-content ${stylex.props(styles.sideContent).className}`}
              >
                {hasPositions && positionsSection}
                {eventSection}
                <SectionTitleWithAge label="收盘定格" at={boardSnapshotAt} />
                <WatchBoard board={board} error={boardError} compact />
                {!hasPositions && positionsSection}
                <TrainerCard />
              </ScrollArea>
            </div>
          </div>
        )}
      </ScrollArea>
    </EventCanvasHost>
  );
}
