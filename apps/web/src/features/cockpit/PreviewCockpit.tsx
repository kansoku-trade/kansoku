import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { QuoteCell, SymbolAnalysisRow } from '@kansoku/shared/types';
import {
  IntradayDashboard,
  IntradayTimeframeSwitch,
} from '@web/features/charts/intraday/IntradayDashboard';
import { ChartLayerMenu } from '@web/features/charts/intraday/ChartLayerMenu';
import { MaLinesMenu } from '@web/features/charts/intraday/MaLinesMenu';
import {
  isViewPeriod,
  tfDataOf,
  withPreviewLevels,
  withViewTimeframe,
} from '@web/features/charts/intraday/timeframes';
import { useViewTimeframe } from '@web/features/charts/intraday/useViewTimeframe';
import { IntradayControlsProvider } from '@web/features/charts/intraday/controlsContext';
import { PredictionTab } from '@web/features/charts/intraday/tabs/PredictionTab';
import { resolveIntradayTf } from '@web/features/charts/intraday/useIntradayDoc';
import { useIntradayPreview } from '@web/features/charts/intraday/useIntradayPreview';
import type { SidebarTab } from '@web/features/charts/SidebarTabs';
import { TopbarQuote } from '@web/features/quotes/QuoteBar';
import { Dot, Empty, ErrorBox } from '@web/ui';
import { useTitle } from '@web/lib/useTitle';
import { AnalystRunFeed } from './AnalystRunFeed';
import { AnalysisTimeline } from './AnalysisTimeline';
import { useAnalystRunLastEnded, useAnalystRunStatus } from './analystRunsStore';
import { CockpitSkeleton } from './CockpitSkeleton';
import { GenerateAnalysis } from './GenerateAnalysis';
import { GenerateAnalysisCta } from './GenerateAnalysisCta';
import { buildSharedSidebarTabs } from './sharedSidebarTabs';
import { useAiUnreadBadge } from './useAiUnreadBadge';
import { useCockpitComments } from './useCockpitComments';
import { useCockpitEnv } from './useCockpitEnv';
import { useCockpitReviewState } from './useCockpitReviewState';

export function PreviewCockpit({
  sym,
  analysesRows,
  onLive,
  onSelectAnalysis,
  liveQuote,
}: {
  sym: string;
  analysesRows: SymbolAnalysisRow[];
  onLive: () => void;
  onSelectAnalysis: (id: string | null) => void;
  liveQuote: QuoteCell | null;
}) {
  const symLabel = sym.toUpperCase().replace(/\.US$/, '');
  const {
    built,
    error,
    degraded,
    intradayTf,
    setIntradayTf,
    predictionUpdatedAt,
    predictionStale,
  } = useIntradayPreview(sym);
  useTitle(symLabel);

  const env = useCockpitEnv(sym);
  const {
    journalEntries,
    reloadJournal,
    reviewSection,
    setReviewSection,
    selectedJournal,
    setSelectedJournal,
  } = useCockpitReviewState(sym);
  const [activeTab, setActiveTab] = useState('prediction');
  const { comments, error: commentsError, loaded: commentsLoaded } = useCockpitComments(sym);
  const { unread } = useAiUnreadBadge(sym, comments, commentsLoaded, activeTab);
  const viewTimeframe = useViewTimeframe(sym, intradayTf ?? 'm15', { live: true, liveQuote });
  const analystRunStatus = useAnalystRunStatus(sym);
  const analystRunLastEndedRaw = useAnalystRunLastEnded(sym);
  const analystRunLastEnded =
    analystRunLastEndedRaw &&
    analysesRows.some((row) => row.created_at >= analystRunLastEndedRaw.startedAt)
      ? null
      : analystRunLastEndedRaw;

  if (error) {
    return (
      <div className="page">
        <ErrorBox>{error}</ErrorBox>
        <p>
          <a href="/">
            <ArrowLeft className="icon" size={13} /> 返回列表
          </a>
        </p>
      </div>
    );
  }

  if (!built) return <CockpitSkeleton />;

  const activeIntradayTf = resolveIntradayTf(built, intradayTf);
  const previewLevels = built.sidebar.prediction
    ? undefined
    : (analystRunStatus?.sections?.technical?.levels ??
      analystRunLastEnded?.sections?.technical?.levels);
  const chartBuilt = withPreviewLevels(
    withViewTimeframe(built, activeIntradayTf, viewTimeframe.tf),
    previewLevels,
  );
  const sidebarTf = isViewPeriod(activeIntradayTf) ? built.defaultTf : activeIntradayTf;

  const sidebarTabs: SidebarTab[] = [
    {
      key: 'prediction',
      label: '预测',
      content: built.sidebar.prediction ? (
        <>
          <PredictionTab
            built={built}
            activeTf={sidebarTf}
            predictionUpdatedAt={predictionUpdatedAt}
            predictionStale={predictionStale}
          />
          <GenerateAnalysis sym={sym} />
        </>
      ) : analystRunStatus ? (
        <AnalystRunFeed sym={sym} />
      ) : analystRunLastEnded ? (
        <>
          <AnalystRunFeed sym={sym} />
          <GenerateAnalysis sym={sym} />
        </>
      ) : analysesRows.length > 0 ? (
        <>
          <Empty>
            当前为实时视图——图表会随行情更新；可从右上角切回历史分析，或生成一份当前分析
          </Empty>
          <GenerateAnalysis sym={sym} />
        </>
      ) : (
        <GenerateAnalysisCta
          sym={sym}
          title="还没有 AI 分析"
          desc="这只股票还没有分析报告——生成一份，图上会标出关键位和多空判断"
        />
      ),
    },
    ...buildSharedSidebarTabs({
      sym,
      sidebar: built.sidebar,
      env,
      analysesRows,
      latestId: null,
      journalEntries,
      reloadJournal,
      reviewSection,
      setReviewSection,
      selectedJournal,
      setSelectedJournal,
      comments,
      commentsError,
      commentsLoaded,
      unread,
    }),
  ];

  return (
    <IntradayControlsProvider>
      <div className="fullpage">
        <div className="detail-topbar detail-topbar--split">
          <div className="topbar-chart">
            <a href="/">
              <ArrowLeft className="icon" size={13} /> 列表
            </a>
            <span className="meta">{sym}</span>
            {degraded && <Dot tone="accent" pulse title="数据延迟：行情拉取失败，正在重试" />}
            <IntradayTimeframeSwitch activeTf={activeIntradayTf} onChange={setIntradayTf} />
            <AnalysisTimeline
              rows={analysesRows}
              activeId={null}
              mode="live"
              onLive={onLive}
              onSelect={onSelectAnalysis}
            />
            {viewTimeframe.error && (
              <span className="tf-load-error" title={viewTimeframe.error}>
                该周期加载失败
              </span>
            )}
            <span className="topbar-chart-tail">
              <MaLinesMenu candles={tfDataOf(chartBuilt, activeIntradayTf)?.candles ?? []} />
              <ChartLayerMenu built={chartBuilt} activeTf={activeIntradayTf} />
            </span>
          </div>
          <div className="topbar-side">
            <TopbarQuote quote={liveQuote} />
          </div>
        </div>
        <div className="detail-body">
          <IntradayDashboard
            symbol={sym}
            built={chartBuilt}
            activeTf={activeIntradayTf}
            sidebarTabs={sidebarTabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            liveQuote={liveQuote}
          />
        </div>
      </div>
    </IntradayControlsProvider>
  );
}
