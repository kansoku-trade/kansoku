import { useEffect, useState } from "react";
import { ArrowLeft, ChevronsRight, PictureInPicture2 } from "lucide-react";
import { IntradayDashboard, IntradayTimeframeSwitch } from "../charts/intraday/IntradayDashboard";
import { resolveIntradayTf, useIntradayDoc } from "../charts/intraday/useIntradayDoc";
import type { SidebarTab } from "../charts/SidebarTabs";
import { SepaDashboard } from "../charts/sepa/SepaDashboard";
import { useCapabilities } from "../capabilitiesStore";
import { getPopoutBridge } from "../desktop/desktopWindowsBridge";
import { TopbarQuote } from "../QuoteBar";
import { marketOfSymbol } from "../lib/market";
import { recordRecentSymbol } from "../recentCharts";
import { Dot, Empty, ErrorBox, MarketTime } from "../ui";
import { useTitle } from "../useTitle";
import { useLiveQuote } from "../useLiveQuote";
import { AnalysisRunDetails } from "./cockpit/AnalysisRunDetails";
import { AnalysisTimeline } from "./cockpit/AnalysisTimeline";
import { ChatDock } from "./cockpit/chat/ChatDock";
import { LockedChatBar } from "./cockpit/chat/LockedChatBar";
import { PreviewCockpit } from "./cockpit/PreviewCockpit";
import { conclusionOutdated } from "../charts/intraday/ConclusionCard";
import { PredictionTab } from "../charts/intraday/tabs/PredictionTab";
import { buildSharedSidebarTabs } from "./cockpit/sharedSidebarTabs";
import { useAiUnreadBadge } from "./cockpit/useAiUnreadBadge";
import { useCockpitComments } from "./cockpit/useCockpitComments";
import { useCockpitEnv } from "./cockpit/useCockpitEnv";
import { useAnalystRun } from "./cockpit/useAnalystRun";
import { useCockpitReviewState } from "./cockpit/useCockpitReviewState";
import { useLatestAnalysis } from "./cockpit/useLatestAnalysis";

function PopoutButton({ sym }: { sym: string }) {
  const bridge = getPopoutBridge();
  if (!bridge) return null;

  return (
    <button
      className="popout-open-btn"
      type="button"
      title="弹出盯盘小窗"
      aria-label="弹出盯盘小窗"
      onClick={() => {
        void bridge.openPopout(sym);
      }}
    >
      <PictureInPicture2 className="icon" size={14} />
    </button>
  );
}

export function SymbolCockpit({ sym }: { sym: string }) {
  const symLabel = sym.toUpperCase().replace(/\.US$/, "");
  const market = marketOfSymbol(sym);
  const liveQuote = useLiveQuote(sym);
  const { pro, licensed } = useCapabilities();
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
    degraded,
    live,
    canLoadForward,
    loadForward,
    forwardBusy,
    intradayTf,
    setIntradayTf,
    loadHistory,
  } = useIntradayDoc(latestId);

  useTitle(doc ? doc.title || symLabel : latestChecked && !latestId ? symLabel : undefined);

  useEffect(() => {
    if (doc || (latestChecked && !latestId && !latestError)) recordRecentSymbol(sym);
  }, [sym, doc?.id, latestChecked, latestId, latestError]);

  const env = useCockpitEnv(sym);
  const { journalEntries, reloadJournal, reviewSection, setReviewSection, selectedJournal, setSelectedJournal } =
    useCockpitReviewState(sym);

  const [activeTab, setActiveTab] = useState("prediction");
  const { comments, error: commentsError, loaded: commentsLoaded } = useCockpitComments(sym);
  const { unread, latestAlert } = useAiUnreadBadge(sym, comments, commentsLoaded, activeTab);

  const intradaySidebar = doc?.built.kind === "intraday" ? doc.built.sidebar : null;
  const reassessNow = Date.now();
  const reassessNeeded =
    conclusionOutdated(intradaySidebar?.context?.generated_at, doc?.prediction_stale, reassessNow) ||
    conclusionOutdated(
      doc?.prediction_updated_at ?? intradaySidebar?.prediction?.anchor?.time,
      doc?.prediction_stale,
      reassessNow,
    );
  const conclusionRun = useAnalystRun(sym, reassessNeeded);
  const conclusionReassess = {
    start: conclusionRun.start,
    busy: conclusionRun.pending || conclusionRun.running,
    hint: conclusionRun.hint,
    details: conclusionRun.status ? <AnalysisRunDetails status={conclusionRun.status} /> : null,
  };

  if (mode === "live") {
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

  if (!doc)
    return (
      <div className="page">
        <Empty>加载中…</Empty>
      </div>
    );

  if (doc.built.kind === "sepa") {
    return (
      <div className="fullpage">
        <div className="detail-topbar">
          <a href="/">
            <ArrowLeft className="icon" size={13} /> 列表
          </a>
          <span className="title">{doc.title}</span>
          <span className="meta">{sym}</span>
          <span className="topbar-actions">
            <PopoutButton sym={sym} />
            {doc.symbol && <TopbarQuote quote={liveQuote} />}
          </span>
        </div>
        <div className="detail-body">
          <SepaDashboard built={doc.built} />
        </div>
      </div>
    );
  }

  if (doc.built.kind !== "intraday")
    return (
      <div className="page">
        <ErrorBox>该图表格式已不再支持，请重新生成（旧格式重建失败）</ErrorBox>
      </div>
    );

  const activeIntradayTf = resolveIntradayTf(doc.built, intradayTf);
  const analysesRows = analyses;

  const sidebarTabs: SidebarTab[] = [
    {
      key: "prediction",
      label: "预测",
      content: (
        <PredictionTab
          built={doc.built}
          activeTf={activeIntradayTf}
          predictionUpdatedAt={doc.prediction_updated_at}
          predictionStale={doc.prediction_stale}
          reassess={conclusionReassess}
        />
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
    <div className="fullpage">
      <div className="detail-topbar">
        <a href="/">
          <ArrowLeft className="icon" size={13} /> 列表
        </a>
        <span className="title">{doc.title}</span>
        <span className="meta">{sym}</span>
        {degraded && <Dot tone="accent" pulse title="数据延迟：行情拉取失败，正在重试" />}
        <span className="topbar-chart-ctrls">
          <IntradayTimeframeSwitch activeTf={activeIntradayTf} onChange={setIntradayTf} />
          {canLoadForward && (
            <button
              className="load-forward-btn"
              disabled={forwardBusy}
              onClick={loadForward}
              title="历史图表默认冻结在分析时的走势，点击加载分析日之后的 K 线到最新"
            >
              <ChevronsRight size={14} className="load-forward-icon" />
              <span>{forwardBusy ? "加载中…" : "加载后续 K 线"}</span>
            </button>
          )}
        </span>
        <span className="topbar-actions">
          {hasNewer && (
            <button className="badge badge--accent alert-badge" onClick={jumpToLatest}>
              <Dot tone="accent" pulse />
              <span className="alert-badge-text">有新分析，点击查看最新</span>
            </button>
          )}
          <AnalysisTimeline
            rows={analysesRows}
            activeId={latestId}
            mode={mode}
            onLive={goToLive}
            onSelect={goToAnalysis}
          />
          {latestAlert && (
            <button
              className={`badge badge--${latestAlert.level === "alert" ? "down" : "accent"} alert-badge`}
              onClick={() => setActiveTab("ai")}
              aria-label={`AI ${latestAlert.level === "alert" ? "警报" : "提醒"}：${latestAlert.text}`}
            >
              <Dot tone={latestAlert.level === "alert" ? "down" : "accent"} pulse />
              <span className="alert-badge-text">
                AI {latestAlert.level === "alert" ? "警报" : "提醒"}{" "}
                <MarketTime value={latestAlert.ts} format="clock" market={market} /> ·{" "}
                {latestAlert.trigger ?? latestAlert.text}
              </span>
            </button>
          )}
          <PopoutButton sym={sym} />
          {doc.symbol && <TopbarQuote quote={liveQuote} />}
        </span>
      </div>
      <div className="detail-body">
        <IntradayDashboard
          symbol={sym}
          built={doc.built}
          activeTf={activeIntradayTf}
          predictionUpdatedAt={doc.prediction_updated_at}
          predictionStale={doc.prediction_stale}
          conclusionReassess={conclusionReassess}
          onLoadHistory={loadHistory}
          sidebarTabs={sidebarTabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          dock={pro ? (licensed ? <ChatDock chartId={doc.id} docCreatedAt={doc.created_at} /> : <LockedChatBar />) : null}
          liveQuote={live ? liveQuote : null}
        />
      </div>
    </div>
  );
}
