import { useEffect, useState } from "react";
import { ArrowLeft, ChevronsRight } from "lucide-react";
import { IntradayDashboard, IntradayTimeframeSwitch } from "../charts/intraday/IntradayDashboard";
import { resolveIntradayTf, useIntradayDoc } from "../charts/intraday/useIntradayDoc";
import type { SidebarTab } from "../charts/SidebarTabs";
import { SepaDashboard } from "../charts/sepa/SepaDashboard";
import { TopbarQuote } from "../QuoteBar";
import { recordRecentSymbol } from "../recentCharts";
import { Dot, Empty, ErrorBox, MarketTime } from "../ui";
import { useTitle } from "../useTitle";
import { AnalysisTimeline } from "./cockpit/AnalysisTimeline";
import { ChatDock } from "./cockpit/chat/ChatDock";
import { PreviewCockpit } from "./cockpit/PreviewCockpit";
import { PredictionTab } from "../charts/intraday/tabs/PredictionTab";
import { buildSharedSidebarTabs } from "./cockpit/sharedSidebarTabs";
import { useAiUnreadBadge } from "./cockpit/useAiUnreadBadge";
import { useCockpitComments } from "./cockpit/useCockpitComments";
import { useCockpitEnv } from "./cockpit/useCockpitEnv";
import { useCockpitReviewState } from "./cockpit/useCockpitReviewState";
import { useLatestAnalysis } from "./cockpit/useLatestAnalysis";

export function SymbolCockpit({ sym }: { sym: string }) {
  const symLabel = sym.toUpperCase().replace(/\.US$/, "");
  const { mode, activeId: latestId, latestChecked, latestError, hasNewer, jumpToLatest, goToAnalysis, analyses } =
    useLatestAnalysis(sym);

  const { doc, error, degraded, canLoadForward, loadForward, forwardBusy, intradayTf, setIntradayTf, loadHistory } =
    useIntradayDoc(latestId);

  useTitle(doc?.title ?? symLabel);

  useEffect(() => {
    if (doc || (latestChecked && !latestId && !latestError)) recordRecentSymbol(sym);
  }, [sym, doc?.id, latestChecked, latestId, latestError]);

  const env = useCockpitEnv(sym);
  const { journalEntries, reloadJournal, reviewSection, setReviewSection, selectedJournal, setSelectedJournal } =
    useCockpitReviewState(sym);

  const [activeTab, setActiveTab] = useState("prediction");
  const { comments, error: commentsError, loaded: commentsLoaded } = useCockpitComments(sym);
  const { unread, latestAlert } = useAiUnreadBadge(sym, comments, commentsLoaded, activeTab);

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
    return <PreviewCockpit sym={sym} />;
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
          <span className="topbar-actions">{doc.symbol && <TopbarQuote symbol={doc.symbol} />}</span>
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
          <AnalysisTimeline rows={analysesRows} activeId={latestId} mode={mode} onSelect={goToAnalysis} />
          {latestAlert && (
            <button
              className={`badge badge--${latestAlert.level === "alert" ? "down" : "accent"} alert-badge`}
              onClick={() => setActiveTab("ai")}
              aria-label={`AI ${latestAlert.level === "alert" ? "警报" : "提醒"}：${latestAlert.text}`}
            >
              <Dot tone={latestAlert.level === "alert" ? "down" : "accent"} pulse />
              <span className="alert-badge-text">
                AI {latestAlert.level === "alert" ? "警报" : "提醒"}{" "}
                <MarketTime value={latestAlert.ts} format="clock" /> ·{" "}
                {latestAlert.trigger ?? latestAlert.text}
              </span>
            </button>
          )}
          {doc.symbol && <TopbarQuote symbol={doc.symbol} />}
        </span>
      </div>
      <div className="detail-body">
        <IntradayDashboard
          symbol={sym}
          built={doc.built}
          activeTf={activeIntradayTf}
          predictionUpdatedAt={doc.prediction_updated_at}
          predictionStale={doc.prediction_stale}
          onLoadHistory={loadHistory}
          sidebarTabs={sidebarTabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          dock={<ChatDock chartId={doc.id} docCreatedAt={doc.created_at} />}
        />
      </div>
    </div>
  );
}
