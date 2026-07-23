import { useEffect, useState } from 'react';
import { ArrowLeft, Bell, ChevronsRight, TriangleAlert } from 'lucide-react';
import { IntradayDashboard, IntradayTimeframeSwitch } from '../charts/intraday/IntradayDashboard';
import { ChartLayerMenu } from '../charts/intraday/ChartLayerMenu';
import { MaLinesMenu } from '../charts/intraday/MaLinesMenu';
import { isViewPeriod, tfDataOf, withViewTimeframe } from '../charts/intraday/timeframes';
import { useViewTimeframe } from '../charts/intraday/useViewTimeframe';
import { IntradayControlsProvider } from '../charts/intraday/controlsContext';
import { resolveIntradayTf, useIntradayDoc } from '../charts/intraday/useIntradayDoc';
import type { SidebarTab } from '../charts/SidebarTabs';
import { SepaCockpit, type SepaDocView } from '../charts/sepa/SepaCockpit';
import { TopbarQuote } from '../quotes/QuoteBar';
import { marketOfSymbol } from '../../lib/market';
import { recordRecentSymbol } from '../charts/recentCharts';
import { Dot, ErrorBox, MarketTime, Tooltip } from '../../ui';
import { useTitle } from '../../lib/useTitle';
import { useLiveQuote } from '../quotes/useLiveQuote';
import { AnalysisRunDetails } from './AnalysisRunDetails';
import { CockpitSkeleton } from './CockpitSkeleton';
import { AnalysisTimeline } from './AnalysisTimeline';
import { ChatDock } from './chat/ChatDock';
import { GenerateAnalysisCta } from './GenerateAnalysisCta';
import { PreviewCockpit } from './PreviewCockpit';
import { ReanalyzeStrip } from './ReanalyzeStrip';
import { conclusionOutdated } from '../charts/intraday/ConclusionCard';
import { PredictionTab } from '../charts/intraday/tabs/PredictionTab';
import { buildSharedSidebarTabs } from './sharedSidebarTabs';
import { useAiUnreadBadge } from './useAiUnreadBadge';
import { useCockpitComments } from './useCockpitComments';
import { useCockpitEnv } from './useCockpitEnv';
import { useAnalystRun } from './useAnalystRun';
import { useCockpitReviewState } from './useCockpitReviewState';
import { useLatestAnalysis } from './useLatestAnalysis';

export function SymbolCockpit({ sym }: { sym: string }) {
  const symLabel = sym.toUpperCase().replace(/\.US$/, '');
  const market = marketOfSymbol(sym);
  const liveQuote = useLiveQuote(sym);
  const {
    mode,
    activeId: latestId,
    latestChecked,
    latestError,
    hasNewer,
    jumpToLatest,
    goToLive,
    goToAnalysis,
    analyses,
  } = useLatestAnalysis(sym);

  const {
    doc,
    error,
    reload,
    degraded,
    live,
    canLoadForward,
    loadForward,
    forwardBusy,
    intradayTf,
    setIntradayTf,
    loadHistory,
  } = useIntradayDoc(mode === 'live' ? null : latestId);

  useTitle(doc ? doc.title || symLabel : latestChecked && !latestId ? symLabel : undefined);

  useEffect(() => {
    if (doc || (latestChecked && !latestId && !latestError)) recordRecentSymbol(sym);
  }, [sym, doc?.id, latestChecked, latestId, latestError]);

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
  const { unread, latestAlert } = useAiUnreadBadge(sym, comments, commentsLoaded, activeTab);

  const intradaySidebar = doc?.built.kind === 'intraday' ? doc.built.sidebar : null;
  const viewTimeframe = useViewTimeframe(sym, intradayTf ?? 'm15', {
    asOf: live ? undefined : intradaySidebar?.asOf,
    live,
    liveQuote,
  });
  const reassessNow = Date.now();
  const reassessNeeded =
    conclusionOutdated(
      intradaySidebar?.context?.generated_at,
      doc?.prediction_stale,
      reassessNow,
    ) ||
    conclusionOutdated(
      doc?.prediction_updated_at ?? intradaySidebar?.prediction?.anchor?.time,
      doc?.prediction_stale,
      reassessNow,
    );
  const conclusionRun = useAnalystRun(sym, mode !== 'live' && reassessNeeded);
  const conclusionReassess = {
    start: conclusionRun.start,
    busy: conclusionRun.pending || conclusionRun.running,
    hint: conclusionRun.hint,
    details: conclusionRun.status ? <AnalysisRunDetails status={conclusionRun.status} /> : null,
  };

  if (mode === 'live') {
    return (
      <PreviewCockpit
        sym={sym}
        analysesRows={analyses}
        onLive={goToLive}
        onSelectAnalysis={goToAnalysis}
        liveQuote={liveQuote}
      />
    );
  }

  if (latestChecked && !latestId) {
    if (latestError)
      return (
        <div className="page">
          <h1>{sym}</h1>
          <ErrorBox>{latestError}</ErrorBox>
          <p>
            <a href="/">
              <ArrowLeft className="icon" size={13} /> 返回列表
            </a>
          </p>
        </div>
      );
    return (
      <PreviewCockpit
        sym={sym}
        analysesRows={analyses}
        onLive={goToLive}
        onSelectAnalysis={goToAnalysis}
        liveQuote={liveQuote}
      />
    );
  }

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

  if (!doc) return <CockpitSkeleton />;

  if (doc.built.kind === 'sepa') {
    const sepaDoc: SepaDocView = { ...doc, built: doc.built };
    return <SepaCockpit sym={sym} doc={sepaDoc} reload={reload} liveQuote={liveQuote} />;
  }

  if (doc.built.kind !== 'intraday')
    return (
      <div className="page">
        <ErrorBox>该图表格式已不再支持，请重新生成（旧格式重建失败）</ErrorBox>
      </div>
    );

  const activeIntradayTf = resolveIntradayTf(doc.built, intradayTf);
  const chartBuilt = withViewTimeframe(doc.built, activeIntradayTf, viewTimeframe.tf);
  const sidebarTf = isViewPeriod(activeIntradayTf) ? doc.built.defaultTf : activeIntradayTf;
  const analysesRows = analyses;

  const sidebarTabs: SidebarTab[] = [
    {
      key: 'prediction',
      label: '预测',
      content: (
        <>
          <ReanalyzeStrip sym={sym} />
          <PredictionTab
            built={doc.built}
            activeTf={sidebarTf}
            predictionUpdatedAt={doc.prediction_updated_at}
            predictionStale={doc.prediction_stale}
            reassess={conclusionReassess}
            emptyCta={
              <GenerateAnalysisCta
                sym={sym}
                title="还没有预测结论"
                desc="这份图目前只有技术面——生成一份 AI 分析，图上会标出关键位和多空判断"
              />
            }
          />
        </>
      ),
    },
    ...buildSharedSidebarTabs({
      sym,
      sidebar: doc.built.sidebar,
      env,
      analysesRows,
      latestId,
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
              activeId={latestId}
              mode={mode}
              onLive={goToLive}
              onSelect={goToAnalysis}
            />
            {canLoadForward && (
              <button
                className="load-forward-btn"
                disabled={forwardBusy}
                onClick={loadForward}
                title="历史图表默认冻结在分析时的走势，点击加载分析日之后的 K 线到最新"
              >
                <ChevronsRight size={14} className="load-forward-icon" />
                <span>{forwardBusy ? '加载中…' : '加载后续 K 线'}</span>
              </button>
            )}
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
            {hasNewer && (
              <button className="badge badge--accent alert-badge" onClick={jumpToLatest}>
                <Dot tone="accent" pulse />
                <span className="alert-badge-text">有新分析</span>
              </button>
            )}
            {latestAlert && (
              <Tooltip
                content={
                  <>
                    AI {latestAlert.level === 'alert' ? '警报' : '提醒'}{' '}
                    <MarketTime value={latestAlert.ts} format="clock" market={market} /> ·{' '}
                    {latestAlert.trigger ?? latestAlert.text}
                  </>
                }
              >
                <button
                  className={`badge badge--${latestAlert.level === 'alert' ? 'down' : 'accent'} alert-badge alert-badge--icon`}
                  onClick={() => setActiveTab('ai')}
                  aria-label={`AI ${latestAlert.level === 'alert' ? '警报' : '提醒'}：${latestAlert.text}`}
                >
                  <Dot tone={latestAlert.level === 'alert' ? 'down' : 'accent'} pulse />
                  {latestAlert.level === 'alert' ? (
                    <TriangleAlert className="icon" size={13} />
                  ) : (
                    <Bell className="icon" size={13} />
                  )}
                </button>
              </Tooltip>
            )}
            {doc.symbol && <TopbarQuote quote={liveQuote} />}
          </div>
        </div>
        <div className="detail-body">
          <IntradayDashboard
            symbol={sym}
            built={chartBuilt}
            activeTf={activeIntradayTf}
            predictionUpdatedAt={doc.prediction_updated_at}
            predictionStale={doc.prediction_stale}
            conclusionReassess={conclusionReassess}
            onLoadHistory={loadHistory}
            sidebarTabs={sidebarTabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            dock={<ChatDock chartId={doc.id} docCreatedAt={doc.created_at} />}
            liveQuote={live ? liveQuote : null}
          />
        </div>
      </div>
    </IntradayControlsProvider>
  );
}
