import { useEffect, useState } from 'react';
import type {
  ChartMeta,
  HomeEvents,
  OverviewBoard,
  PortfolioSummary,
  QuoteSnapshot,
} from '@kansoku/shared/types';
import { marketDate } from '@kansoku/shared/time';
import { usePollingQuery, useQuery } from '../../lib/apiHooks';
import { client } from '../../lib/client';
import { navigate, useQueryParam } from '../../lib/router';
import { isDesktopRealtime } from '../../lib/portTransport';
import { DataAgeBadge, ErrorBox, ScrollArea, SectionTitle } from '../../ui';
import { useTitle } from '../../lib/useTitle';
import { useWsChannel } from '../../lib/ws/useWsChannel';
import { useIntervalFetch } from '../cockpit/useIntervalFetch';
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

const SESSION_LABEL: Record<string, string> = {
  pre: '盘前',
  regular: '盘中',
  post: '盘后',
  overnight: '休市',
};
const NOTICE_LABEL: Record<string, string> = { 'chart-not-found': '该图表不存在，已为你返回首页' };

function SectionTitleWithAge({ label, at }: { label: string; at: number | null }) {
  return (
    <SectionTitle className="section-title--with-age">
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
      <SectionTitle>事件日历</SectionTitle>
      <EventCalendar events={events ?? null} error={eventsError} after={after} />
      <SectionTitle>已发生</SectionTitle>
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

  return (
    <EventCanvasHost>
    <ScrollArea
      className={`page home-page${hasSplitBoard ? ' home-page--split' : ''}`}
      viewportClassName="home-page-viewport"
      contentClassName="home-page-content"
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
      <QuickBar shortcuts={shortcuts} showGlobalActions={!isDesktopRealtime()} />
      <DateTimeline
        dates={timelineDates}
        selected={date}
        onSelect={(d) => navigate(`/?date=${d}`, { replace: true })}
      />
      {isToday && !board && !boardError && <div className="note-block">盘面加载中…</div>}
      {isToday && boardError && !board && <ErrorBox>{boardError}</ErrorBox>}
      {!isToday && <RecapBoard date={date} defaultExpanded />}
      {isToday && board && trading && (
        <div className="home-grid">
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
          <div className="home-side">
            <ScrollArea className="home-side-scroll" contentClassName="home-side-content">
              {hasPositions && positionsSection}
              {eventSection}
              {!hasPositions && positionsSection}
              <TrainerCard />
            </ScrollArea>
          </div>
        </div>
      )}
      {isToday && board && after && (
        <div className="home-grid">
          <div className="home-main">
            <RecapBoard date={date} defaultExpanded />
            {flowSection}
          </div>
          <div className="home-side">
            <ScrollArea className="home-side-scroll" contentClassName="home-side-content">
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
