import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { BenchmarkSeries, CockpitPosition, RelativeVolume } from "../../../shared/types";
import { useQuery } from "../apiHooks";
import { IntradayDashboard, IntradayTimeframeSwitch } from "../charts/intraday/IntradayDashboard";
import { client } from "../client";
import { NewsTab } from "../charts/intraday/tabs/NewsTab";
import { PredictionTab } from "../charts/intraday/tabs/PredictionTab";
import { resolveIntradayTf, useIntradayDoc } from "../charts/intraday/useIntradayDoc";
import type { SidebarTab } from "../charts/SidebarTabs";
import { SepaDashboard } from "../charts/sepa/SepaDashboard";
import { TopbarQuote } from "../QuoteBar";
import { recordRecentSymbol } from "../recentCharts";
import { Badge, Dot, Empty, ErrorBox, MarketTime } from "../ui";
import { useTitle } from "../useTitle";
import { useSSE } from "../useSSE";
import { AiTab } from "./cockpit/AiTab";
import { AnalysisTimeline } from "./cockpit/AnalysisTimeline";
import { ChatDock } from "./cockpit/chat/ChatDock";
import { EnvTab } from "./cockpit/EnvTab";
import { FlowTab } from "./cockpit/FlowTab";
import { GenerateAnalysis } from "./cockpit/GenerateAnalysis";
import { ReviewTab, type ReviewSection } from "./cockpit/ReviewTab";
import { useCockpitComments } from "./cockpit/useCockpitComments";
import { useLatestAnalysis } from "./cockpit/useLatestAnalysis";

interface PositionPayload {
  position: CockpitPosition | null;
  relvol: RelativeVolume | null;
}

export function SymbolCockpit({ sym }: { sym: string }) {
  const symLabel = sym.toUpperCase().replace(/\.US$/, "");
  const { mode, activeId: latestId, latestChecked, latestError, hasNewer, jumpToLatest, goToAnalysis, analyses } =
    useLatestAnalysis(sym);

  const { doc, error, degraded, intradayTf, setIntradayTf, loadHistory } = useIntradayDoc(latestId);

  useTitle(doc?.title ?? symLabel);

  useEffect(() => {
    if (doc) recordRecentSymbol(sym);
  }, [sym, doc?.id]);

  const [position, setPosition] = useState<CockpitPosition | null>(null);
  const [relvol, setRelvol] = useState<RelativeVolume | null>(null);
  const [benchmark, setBenchmark] = useState<BenchmarkSeries[] | null>(null);
  useEffect(() => {
    setPosition(null);
    setRelvol(null);
    setBenchmark(null);
  }, [sym]);
  const { degraded: positionDegraded } = useSSE<PositionPayload>({ kind: "position", symbol: sym }, (d) => {
    setPosition(d.position);
    setRelvol(d.relvol);
  });
  const { degraded: benchmarkDegraded } = useSSE<BenchmarkSeries[]>({ kind: "benchmark", symbol: sym }, setBenchmark);
  const positionError = positionDegraded ? "持仓数据获取失败，正在重试" : null;
  const benchmarkError = benchmarkDegraded ? "环境对照数据获取失败，正在重试" : null;

  const { data: journal } = useQuery<{ name: string; date: string }[]>(`symbols.journal:${sym}`, () =>
    client.symbols.journal({ sym }),
  );

  const [activeTab, setActiveTab] = useState("prediction");
  const [reviewSection, setReviewSection] = useState<ReviewSection>("history");
  const [selectedJournal, setSelectedJournal] = useState<string | null>(null);
  useEffect(() => {
    setSelectedJournal(null);
    setReviewSection("history");
  }, [sym]);
  const journalEntries = journal ?? [];
  const { comments, error: commentsError, loaded: commentsLoaded } = useCockpitComments(sym);

  const warnAlertCount = comments.reduce((n, c) => (c.level === "warn" || c.level === "alert" ? n + 1 : n), 0);
  const [readCount, setReadCount] = useState<number | null>(null);
  useEffect(() => {
    setReadCount(null);
  }, [sym]);
  useEffect(() => {
    if (commentsLoaded && readCount === null) setReadCount(warnAlertCount);
  }, [commentsLoaded, readCount, warnAlertCount]);
  useEffect(() => {
    if (activeTab === "ai") setReadCount(warnAlertCount);
  }, [activeTab, warnAlertCount]);
  const unread = activeTab === "ai" || readCount === null ? 0 : Math.max(0, warnAlertCount - readCount);

  const latestAlert = useMemo(() => {
    for (let i = comments.length - 1; i >= 0; i--) {
      const c = comments[i];
      if (c.level === "warn" || c.level === "alert") return c;
    }
    return null;
  }, [comments]);

  if (latestChecked && !latestId) {
    return (
      <div className="page">
        <h1>{sym}</h1>
        {latestError ? (
          <ErrorBox>{latestError}</ErrorBox>
        ) : (
          <>
            <Empty>这只股票还没有 intraday 分析——点下面按钮让 AI 生成，或跑一次 intraday-signal</Empty>
            <GenerateAnalysis sym={sym} />
          </>
        )}
        <p>
          <a href="/">
            <ArrowLeft className="icon" size={13} /> 返回列表
          </a>
        </p>
      </div>
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
  const s = doc.built.sidebar;
  const hasNews = Boolean(s.context?.news?.length) || Boolean(s.news?.length);
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
    {
      key: "env",
      label: "环境",
      content: (
        <>
          <EnvTab
            position={position}
            positionError={positionError}
            benchmark={benchmark}
            benchmarkError={benchmarkError}
            relvol={relvol}
          />
          <FlowTab symbol={sym} />
        </>
      ),
    },
    { key: "news", label: "消息", hidden: !hasNews, content: <NewsTab context={s.context} news={s.news ?? []} /> },
    {
      key: "review",
      label: "复盘",
      content: (
        <ReviewTab
          symbol={sym}
          rows={analysesRows}
          currentId={latestId}
          journal={journalEntries}
          section={reviewSection}
          onSectionChange={setReviewSection}
          selectedJournal={selectedJournal}
          onSelectJournal={setSelectedJournal}
        />
      ),
    },
    {
      key: "ai",
      label: (
        <>
          AI 点评{unread > 0 && <Badge tone="down" className="unread-badge">{unread}</Badge>}
        </>
      ),
      content: <AiTab symbol={sym} comments={comments} error={commentsError} loaded={commentsLoaded} />,
    },
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
          <IntradayTimeframeSwitch activeTf={activeIntradayTf} onChange={setIntradayTf} />
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
