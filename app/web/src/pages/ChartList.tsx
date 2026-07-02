import { useEffect, useState } from "react";
import type { ChartMeta, LegacyChart } from "../../../shared/types";
import { api } from "../api";
import { QuoteBar } from "../QuoteBar";

interface MetaWithUrl extends ChartMeta {
  url: string;
  prediction_stale: boolean;
}

export function ChartList() {
  const [charts, setCharts] = useState<MetaWithUrl[] | null>(null);
  const [legacy, setLegacy] = useState<LegacyChart[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState("");
  const [symbol, setSymbol] = useState("");
  const [showLegacy, setShowLegacy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (symbol) params.set("symbol", symbol);
    api<MetaWithUrl[]>(`/api/charts?${params}`)
      .then(setCharts)
      .catch((e: Error) => setError(e.message));
  }, [type, symbol]);

  useEffect(() => {
    api<LegacyChart[]>("/api/legacy").then(setLegacy).catch(() => setLegacy([]));
  }, []);

  return (
    <div className="page">
      <h1>Trade Charts</h1>
      <div className="sub">图表数据存于 journal/charts/data · 渲染永远是最新版</div>
      <QuoteBar />
      <div className="filters">
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">全部类型</option>
          <option value="sepa">sepa</option>
          <option value="intraday">intraday</option>
          <option value="flow">flow</option>
          <option value="kline">kline</option>
          <option value="cohort">cohort</option>
        </select>
        <input
          placeholder="按 symbol 过滤，如 MRVL"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
        />
      </div>
      {error && <div className="error-box">{error}</div>}
      {charts && charts.length === 0 && <div className="empty">还没有图表 —— 让 Claude 出一张即可出现在这里</div>}
      {charts?.map((m) => (
        <a key={m.id} className="chart-row" href={`#/charts/${encodeURIComponent(m.id)}`}>
          <span className="date">{m.id.slice(0, 10)}</span>
          <span className={`badge ${m.type}`}>{m.type}</span>
          <span className="title">{m.title}</span>
          {m.symbol && <span className="sym">{m.symbol}</span>}
          {m.prediction_stale && <span className="stale-dot" title="预测已过期" />}
        </a>
      ))}
      {legacy.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 32, cursor: "pointer" }} onClick={() => setShowLegacy(!showLegacy)}>
            旧版单文件 HTML 存档（{legacy.length}） {showLegacy ? "▾" : "▸"}
          </div>
          {showLegacy &&
            legacy.map((f) => (
              <a key={f.file} className="chart-row" href={f.url} target="_blank" rel="noreferrer">
                <span className="date">{f.date}</span>
                <span className="badge">html</span>
                <span className="title">{f.file}</span>
              </a>
            ))}
        </>
      )}
    </div>
  );
}
