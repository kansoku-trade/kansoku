import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import type { BenchmarkSeries, ChartDoc, CockpitPosition, RelativeVolume, SymbolAnalysisRow } from "../../../shared/types";
import { formatMarketClock } from "../../../shared/time";
import { useQuery } from "../apiHooks";
import { IntradayDashboard, IntradayTimeframeSwitch } from "../charts/intraday/IntradayDashboard";
import { NewsTab } from "../charts/intraday/tabs/NewsTab";
import { PredictionTab } from "../charts/intraday/tabs/PredictionTab";
import { resolveIntradayTf, useIntradayDoc } from "../charts/intraday/useIntradayDoc";
import type { SidebarTab } from "../charts/SidebarTabs";
import { TopbarQuote } from "../QuoteBar";
import { Badge, Dot, Empty, ErrorBox } from "../ui";
import { AiTab } from "./cockpit/AiTab";
import { EnvTab } from "./cockpit/EnvTab";
import { FlowTab } from "./cockpit/FlowTab";
import { GenerateAnalysis } from "./cockpit/GenerateAnalysis";
import { HistoryTab } from "./cockpit/HistoryTab";
import { useCockpitComments } from "./cockpit/useCockpitComments";
import { useIntervalFetch } from "./cockpit/useIntervalFetch";

type LatestDoc = ChartDoc & { url: string; prediction_stale?: boolean };

export function SymbolCockpit({ sym }: { sym: string }) {
  const [generated, setGenerated] = useState<{ symbol: string; id: string } | null>(null);
  const generatedId = generated?.symbol === sym ? generated.id : null;
  const latestUrl = `/api/symbols/${encodeURIComponent(sym)}/latest`;
  const { data: latestDoc, failure: latestFailure, loading: latestLoading } = useQuery<LatestDoc>(latestUrl);
  const latestId = generatedId ?? latestDoc?.id ?? null;
  const latestChecked = !latestLoading;
  const latestError = latestFailure && latestFailure.status !== 404 ? latestFailure.message : null;
  const markGeneratedReady = useCallback((id: string) => setGenerated({ symbol: sym, id }), [sym]);

  useEffect(() => {
    setGenerated(null);
  }, [sym]);

  const { doc, error, degraded, intradayTf, setIntradayTf, loadHistory } = useIntradayDoc(latestId);

  const { data: position, error: positionError } = useIntervalFetch<CockpitPosition>(
    `/api/symbols/${encodeURIComponent(sym)}/position`,
    60_000,
  );
  const { data: benchmark, error: benchmarkError } = useIntervalFetch<BenchmarkSeries[]>(
    `/api/symbols/${encodeURIComponent(sym)}/benchmark`,
    60_000,
  );
  const { data: relvol } = useIntervalFetch<RelativeVolume | null>(
    `/api/symbols/${encodeURIComponent(sym)}/relvol`,
    60_000,
  );

  const { data: analyses } = useQuery<SymbolAnalysisRow[]>(`/api/symbols/${encodeURIComponent(sym)}/analyses`);

  const [activeTab, setActiveTab] = useState("prediction");
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
            <GenerateAnalysis sym={sym} onReady={markGeneratedReady} />
          </>
        )}
        <p>
          <a href="#/">
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
          <a href="#/">
            <ArrowLeft className="icon" size={13} /> 返回列表
          </a>
        </p>
      </div>
    );
  }

  if (!doc || doc.built.kind !== "intraday")
    return (
      <div className="page">
        <Empty>加载中…</Empty>
      </div>
    );

  const activeIntradayTf = resolveIntradayTf(doc.built, intradayTf);
  const s = doc.built.sidebar;
  const hasNews = Boolean(s.context?.news?.length) || Boolean(s.news?.length);
  const envHidden = position === null && Boolean(benchmarkError);
  const analysesRows = analyses ?? [];

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
    { key: "flow", label: "资金流", content: <FlowTab symbol={sym} /> },
    { key: "news", label: "消息", hidden: !hasNews, content: <NewsTab context={s.context} news={s.news ?? []} /> },
    {
      key: "env",
      label: "持仓&环境",
      hidden: envHidden,
      content: (
        <EnvTab
          position={position}
          positionError={positionError}
          benchmark={benchmark}
          benchmarkError={benchmarkError}
          relvol={relvol}
        />
      ),
    },
    {
      key: "history",
      label: "历史",
      hidden: analysesRows.length === 0,
      content: <HistoryTab rows={analysesRows} currentId={latestId} />,
    },
    {
      key: "ai",
      label: (
        <>
          AI 点评{unread > 0 && <Badge tone="down" className="unread-badge">{unread}</Badge>}
        </>
      ),
      content: <AiTab symbol={sym} comments={comments} error={commentsError} />,
    },
  ];

  return (
    <div className="fullpage">
      <div className="detail-topbar">
        <a href="#/">
          <ArrowLeft className="icon" size={13} /> 列表
        </a>
        <span className="title">{doc.title}</span>
        <span className="meta">{sym}</span>
        {degraded && <Dot tone="accent" pulse title="数据延迟：行情拉取失败，正在重试" />}
        <span className="topbar-actions">
          {latestAlert && (
            <button
              className={`badge badge--${latestAlert.level === "alert" ? "down" : "accent"} alert-badge`}
              onClick={() => setActiveTab("ai")}
              title={latestAlert.text}
            >
              <Dot tone={latestAlert.level === "alert" ? "down" : "accent"} pulse />
              <span className="alert-badge-text">
                AI {latestAlert.level === "alert" ? "警报" : "提醒"} {formatMarketClock(latestAlert.ts)} ·{" "}
                {latestAlert.trigger ?? latestAlert.text}
              </span>
            </button>
          )}
          <IntradayTimeframeSwitch activeTf={activeIntradayTf} onChange={setIntradayTf} />
          {latestId && (
            <a href={`#/charts/${encodeURIComponent(latestId)}`}>
              存档 <ArrowUpRight className="icon" size={13} />
            </a>
          )}
          {doc.symbol && <TopbarQuote symbol={doc.symbol} />}
        </span>
      </div>
      <div className="detail-body">
        <IntradayDashboard
          built={doc.built}
          activeTf={activeIntradayTf}
          predictionUpdatedAt={doc.prediction_updated_at}
          predictionStale={doc.prediction_stale}
          onLoadHistory={loadHistory}
          sidebarTabs={sidebarTabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      </div>
    </div>
  );
}
