import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { QuoteCell, SymbolAnalysisRow } from '@kansoku/shared/types';
import { IntradayDashboard, IntradayTimeframeSwitch } from '@web/charts/intraday/IntradayDashboard';
import { PredictionTab } from '@web/charts/intraday/tabs/PredictionTab';
import { resolveIntradayTf } from '@web/charts/intraday/useIntradayDoc';
import { useIntradayPreview } from '@web/charts/intraday/useIntradayPreview';
import type { SidebarTab } from '@web/charts/SidebarTabs';
import { TopbarQuote } from '@web/QuoteBar';
import { Dot, Empty, ErrorBox } from '@web/ui';
import { useTitle } from '@web/useTitle';
import { AnalysisTimeline } from './AnalysisTimeline';
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
  const { built, error, degraded, intradayTf, setIntradayTf, predictionUpdatedAt, predictionStale } =
    useIntradayPreview(sym);
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

  if (!built)
    return (
      <div className="page">
        <Empty>加载中…</Empty>
      </div>
    );

  const activeIntradayTf = resolveIntradayTf(built, intradayTf);

  const sidebarTabs: SidebarTab[] = [
    {
      key: 'prediction',
      label: '预测',
      content: built.sidebar.prediction ? (
        <>
          <PredictionTab
            built={built}
            activeTf={activeIntradayTf}
            predictionUpdatedAt={predictionUpdatedAt}
            predictionStale={predictionStale}
          />
          <GenerateAnalysis sym={sym} />
        </>
      ) : (
        analysesRows.length > 0 ? (
          <>
            <Empty>当前为实时视图——图表会随行情更新；可从右上角切回历史分析，或生成一份当前分析</Empty>
            <GenerateAnalysis sym={sym} />
          </>
        ) : (
          <GenerateAnalysisCta
            sym={sym}
            title="还没有 AI 分析"
            desc="这只股票还没有分析报告——生成一份，图上会标出关键位和多空判断"
          />
        )
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
    <div className="fullpage">
      <div className="detail-topbar">
        <a href="/">
          <ArrowLeft className="icon" size={13} /> 列表
        </a>
        <span className="title">{symLabel}</span>
        <span className="meta">{sym}</span>
        {degraded && <Dot tone="accent" pulse title="数据延迟：行情拉取失败，正在重试" />}
        <span className="topbar-chart-ctrls">
          <IntradayTimeframeSwitch activeTf={activeIntradayTf} onChange={setIntradayTf} />
        </span>
        <span className="topbar-actions">
          <AnalysisTimeline
            rows={analysesRows}
            activeId={null}
            mode="live"
            onLive={onLive}
            onSelect={onSelectAnalysis}
          />
          <TopbarQuote quote={liveQuote} />
        </span>
      </div>
      <div className="detail-body">
        <IntradayDashboard
          symbol={sym}
          built={built}
          activeTf={activeIntradayTf}
          sidebarTabs={sidebarTabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          liveQuote={liveQuote}
        />
      </div>
    </div>
  );
}
