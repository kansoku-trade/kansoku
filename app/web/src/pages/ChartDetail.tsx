import { useEffect, useRef, useState } from "react";
import type { ChartBuilt, ChartDoc, IntradayBuilt, TimeframeKey } from "../../../shared/types";
import { api } from "../api";
import { EChartsView } from "../charts/EChartsView";
import { IntradayDashboard, IntradayTimeframeSwitch } from "../charts/intraday/IntradayDashboard";
import { SepaDashboard } from "../charts/sepa/SepaDashboard";
import { TopbarQuote } from "../QuoteBar";
import { useSSE } from "../useSSE";

const LIVE_TYPES = new Set(["flow", "kline", "intraday"]);

type ChartDocView = ChartDoc & { prediction_stale?: boolean };

const HISTORY_MAX_COUNT = 1000;

const resolveIntradayTf = (built: IntradayBuilt, preferred: TimeframeKey | null): TimeframeKey => {
  if (preferred && preferred in built.timeframes) return preferred;
  if (built.defaultTf in built.timeframes) return built.defaultTf;
  return "m15";
};

export function ChartDetail({ id }: { id: string }) {
  const [doc, setDoc] = useState<ChartDocView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewCount, setViewCount] = useState<number | null>(null);
  const [intradayTf, setIntradayTf] = useState<TimeframeKey | null>(null);
  const historyBusyRef = useRef(false);
  const docRef = useRef<ChartDocView | null>(null);
  const viewCountRef = useRef<number | null>(null);

  useEffect(() => {
    setDoc(null);
    setError(null);
    setViewCount(null);
    setIntradayTf(null);
    historyBusyRef.current = false;
    api<ChartDocView>(`/api/charts/${encodeURIComponent(id)}`)
      .then(setDoc)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  docRef.current = doc;
  viewCountRef.current = viewCount;

  const live = Boolean(doc && LIVE_TYPES.has(doc.type) && doc.symbol);
  const { degraded } = useSSE<{ built: ChartBuilt; prediction_updated_at?: string; prediction_stale?: boolean }>(
    live ? `/api/stream/charts/${encodeURIComponent(id)}${viewCount ? `?count=${viewCount}` : ""}` : null,
    (d) =>
      setDoc((prev) =>
        prev
          ? { ...prev, built: d.built, prediction_updated_at: d.prediction_updated_at, prediction_stale: d.prediction_stale }
          : prev,
      ),
  );

  const loadHistory = () => {
    if (historyBusyRef.current) return;
    const docNow = docRef.current;
    if (!docNow || docNow.built.kind !== "intraday") return;
    const bars = Math.max(...Object.values(docNow.built.timeframes).map((t) => t.candles.length), 0);
    const current = viewCountRef.current ?? bars;
    if (current <= 0 || current >= HISTORY_MAX_COUNT) return;
    historyBusyRef.current = true;
    api<{ built: ChartBuilt; count: number }>(
      `/api/charts/${encodeURIComponent(id)}/built?count=${Math.min(current * 2, HISTORY_MAX_COUNT)}`,
    )
      .then((d) => {
        setViewCount(d.count);
        setDoc((p) => (p ? { ...p, built: d.built } : p));
      })
      .catch(() => undefined)
      .finally(() => {
        historyBusyRef.current = false;
      });
  };

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

  const activeIntradayTf = doc.built.kind === "intraday" ? resolveIntradayTf(doc.built, intradayTf) : null;

  return (
    <div className="fullpage">
      <div className="detail-topbar">
        <a href="#/">← 列表</a>
        <span className="title">{doc.title}</span>
        <span className="meta">
          {doc.id} · 更新 {doc.updated_at.slice(0, 16).replace("T", " ")}
        </span>
        {live && degraded && <span className="degraded-dot" title="数据延迟：行情拉取失败，正在重试" />}
        <span className="topbar-actions">
          {activeIntradayTf && <IntradayTimeframeSwitch activeTf={activeIntradayTf} onChange={setIntradayTf} />}
          {doc.symbol && <TopbarQuote symbol={doc.symbol} />}
        </span>
      </div>
      <div className="detail-body">
        {doc.built.kind === "echarts" && <EChartsView built={doc.built} />}
        {doc.built.kind === "sepa" && <SepaDashboard built={doc.built} />}
        {doc.built.kind === "intraday" && activeIntradayTf && (
          <IntradayDashboard
            built={doc.built}
            activeTf={activeIntradayTf}
            predictionUpdatedAt={doc.prediction_updated_at}
            predictionStale={doc.prediction_stale}
            onLoadHistory={loadHistory}
          />
        )}
      </div>
    </div>
  );
}
