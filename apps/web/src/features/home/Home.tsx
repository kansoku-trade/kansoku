import { useEffect, useState } from 'react';
import type { ChartMeta, OverviewBoard, PortfolioSummary } from '@kansoku/shared/types';
import { marketDate } from '@kansoku/shared/time';
import { useQuery } from '../../lib/apiHooks';
import { client } from '../../lib/client';
import { navigate, useQueryParam } from '../../router';
import { QuoteBar } from '../quotes/QuoteBar';
import { isDesktopRealtime } from '../../lib/portTransport';
import { Badge, DataAgeBadge, ErrorBox, SectionTitle } from '../../ui';
import { useTitle } from '../../lib/useTitle';
import { useWsChannel } from '../../lib/ws/useWsChannel';
import { useIntervalFetch } from '../cockpit/useIntervalFetch';
import { CROSS_SECTION_TYPES, CrossSectionCharts } from './CrossSectionCharts';
import { DateTimeline } from './DateTimeline';
import { PositionsCard } from './PositionsCard';
import { QuickBar } from './QuickBar';
import { RecapBoard } from './RecapBoard';
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
  const watching = new Set(board?.rows.map((r) => r.symbol) ?? []);
  const shortcuts = [
    ...new Set([...watching, ...(portfolio?.positions.map((p) => p.symbol) ?? [])]),
  ];

  return (
    <div className="page home-page">
      <h1>
        盘面{' '}
        {isToday && session && (
          <Badge className="session-tag">{SESSION_LABEL[session] ?? session}</Badge>
        )}
      </h1>
      <div className="sub">
        {isToday
          ? `${board?.date ?? ''} · 盘中看盘、盘后复盘，随时段自动切换`
          : `${date} · 历史复盘`}
      </div>
      {notice && NOTICE_LABEL[notice] && <ErrorBox>{NOTICE_LABEL[notice]}</ErrorBox>}
      <QuoteBar />
      <QuickBar shortcuts={shortcuts} showGlobalActions={!isDesktopRealtime()} />
      <DateTimeline
        dates={timelineDates}
        selected={date}
        onSelect={(d) => navigate(`/?date=${d}`, { replace: true })}
      />
      {isToday && !board && !boardError && <div className="note-block">盘面加载中…</div>}
      {isToday && boardError && !board && <ErrorBox>{boardError}</ErrorBox>}
      {(!isToday || board) && (
        <div className="home-grid">
          <div className="home-main">
            {trading ? (
              <>
                <SectionTitleWithAge label="看盘" at={boardSnapshotAt} />
                <WatchBoard board={board!} error={boardError} compact={false} />
                <CrossSectionCharts date={date} />
              </>
            ) : (
              <RecapBoard date={date} defaultExpanded />
            )}
          </div>
          <div className="home-side">
            {trading ? (
              <>
                <SectionTitleWithAge label="持仓" at={portfolioAgeAt} />
                <PositionsCard portfolio={portfolio} error={portfolioError} watching={watching} />
                <RecapBoard date={date} defaultExpanded={false} />
              </>
            ) : isToday ? (
              <>
                <SectionTitleWithAge label="看盘（定格）" at={boardSnapshotAt} />
                <WatchBoard board={board!} error={boardError} compact />
                <SectionTitleWithAge label="持仓" at={portfolioAgeAt} />
                <PositionsCard portfolio={portfolio} error={portfolioError} watching={watching} />
                <CrossSectionCharts date={date} />
              </>
            ) : (
              <CrossSectionCharts date={date} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
