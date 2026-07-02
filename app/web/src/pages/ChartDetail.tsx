import { useEffect, useState } from "react";
import type { ChartBuilt, ChartDoc } from "../../../shared/types";
import { api } from "../api";
import { EChartsView } from "../charts/EChartsView";
import { IntradayDashboard } from "../charts/intraday/IntradayDashboard";
import { SepaDashboard } from "../charts/sepa/SepaDashboard";
import { TopbarQuote } from "../QuoteBar";
import { useSSE } from "../useSSE";

const LIVE_TYPES = new Set(["flow", "kline", "intraday"]);

type ChartDocView = ChartDoc & { prediction_stale?: boolean };

export function ChartDetail({ id }: { id: string }) {
  const [doc, setDoc] = useState<ChartDocView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDoc(null);
    setError(null);
    api<ChartDocView>(`/api/charts/${encodeURIComponent(id)}`)
      .then(setDoc)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  const live = Boolean(doc && LIVE_TYPES.has(doc.type) && doc.symbol);
  const { degraded } = useSSE<{ built: ChartBuilt; prediction_updated_at?: string; prediction_stale?: boolean }>(
    live ? `/api/stream/charts/${encodeURIComponent(id)}` : null,
    (d) =>
      setDoc((prev) =>
        prev
          ? { ...prev, built: d.built, prediction_updated_at: d.prediction_updated_at, prediction_stale: d.prediction_stale }
          : prev,
      ),
  );

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
  if (!doc) return <div className="page empty">加载中…</div>;

  return (
    <div className="fullpage">
      <div className="detail-topbar">
        <a href="#/">← 列表</a>
        <span className="title">{doc.title}</span>
        <span className="meta">
          {doc.id} · 更新 {doc.updated_at.slice(0, 16).replace("T", " ")}
        </span>
        {live && degraded && <span className="degraded-dot" title="数据延迟：行情拉取失败，正在重试" />}
        {doc.symbol && <TopbarQuote symbol={doc.symbol} />}
      </div>
      <div className="detail-body">
        {doc.built.kind === "echarts" && <EChartsView built={doc.built} />}
        {doc.built.kind === "sepa" && <SepaDashboard built={doc.built} />}
        {doc.built.kind === "intraday" && (
          <IntradayDashboard
            built={doc.built}
            predictionUpdatedAt={doc.prediction_updated_at}
            predictionStale={doc.prediction_stale}
          />
        )}
      </div>
    </div>
  );
}
