import { useEffect, useState } from "react";
import type { BenchmarkSeries, ChartDoc, CockpitPosition, SymbolAnalysisRow } from "../../../shared/types";
import { api } from "../api";
import { IntradayDashboard, IntradayTimeframeSwitch } from "../charts/intraday/IntradayDashboard";
import { NewsTab } from "../charts/intraday/tabs/NewsTab";
import { PredictionTab } from "../charts/intraday/tabs/PredictionTab";
import { resolveIntradayTf, useIntradayDoc } from "../charts/intraday/useIntradayDoc";
import type { SidebarTab } from "../charts/SidebarTabs";
import { TopbarQuote } from "../QuoteBar";
import { EnvTab } from "./cockpit/EnvTab";
import { FlowTab } from "./cockpit/FlowTab";
import { HistoryTab } from "./cockpit/HistoryTab";
import { useIntervalFetch } from "./cockpit/useIntervalFetch";

type LatestDoc = ChartDoc & { url: string; prediction_stale?: boolean };

export function SymbolCockpit({ sym }: { sym: string }) {
  const [latestId, setLatestId] = useState<string | null>(null);
  const [latestChecked, setLatestChecked] = useState(false);

  useEffect(() => {
    setLatestId(null);
    setLatestChecked(false);
    api<LatestDoc>(`/api/symbols/${encodeURIComponent(sym)}/latest`)
      .then((d) => {
        setLatestId(d.id);
        setLatestChecked(true);
      })
      .catch(() => setLatestChecked(true));
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

  const [analyses, setAnalyses] = useState<SymbolAnalysisRow[] | null>(null);
  useEffect(() => {
    setAnalyses(null);
    api<SymbolAnalysisRow[]>(`/api/symbols/${encodeURIComponent(sym)}/analyses`)
      .then(setAnalyses)
      .catch(() => setAnalyses([]));
  }, [sym]);

  if (latestChecked && !latestId) {
    return (
      <div className="page">
        <h1>{sym}</h1>
        <div className="empty">这只股票还没有 intraday 分析——先跑一次 intraday-signal 生成分析</div>
        <p>
          <a href="#/">← 返回列表</a>
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <div className="error-box">{error}</div>
        <p>
          <a href="#/">← 返回列表</a>
        </p>
      </div>
    );
  }

  if (!doc || doc.built.kind !== "intraday") return <div className="page empty">加载中…</div>;

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
        <EnvTab position={position} positionError={positionError} benchmark={benchmark} benchmarkError={benchmarkError} />
      ),
    },
    {
      key: "history",
      label: "历史",
      hidden: analysesRows.length === 0,
      content: <HistoryTab rows={analysesRows} currentId={latestId} />,
    },
  ];

  return (
    <div className="fullpage">
      <div className="detail-topbar">
        <a href="#/">← 列表</a>
        <span className="title">{doc.title}</span>
        <span className="meta">{sym}</span>
        {degraded && <span className="degraded-dot" title="数据延迟：行情拉取失败，正在重试" />}
        <span className="topbar-actions">
          <IntradayTimeframeSwitch activeTf={activeIntradayTf} onChange={setIntradayTf} />
          {latestId && <a href={`#/charts/${encodeURIComponent(latestId)}`}>存档 ↗</a>}
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
        />
      </div>
    </div>
  );
}
