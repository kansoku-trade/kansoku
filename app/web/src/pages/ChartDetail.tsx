import { SimpleChartView } from "../charts/simple/SimpleChartView";
import { IntradayDashboard, IntradayTimeframeSwitch } from "../charts/intraday/IntradayDashboard";
import { resolveIntradayTf, useIntradayDoc } from "../charts/intraday/useIntradayDoc";
import { SepaDashboard } from "../charts/sepa/SepaDashboard";
import { TopbarQuote } from "../QuoteBar";

export function ChartDetail({ id }: { id: string }) {
  const { doc, error, degraded, live, intradayTf, setIntradayTf, loadHistory } = useIntradayDoc(id);

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
          {doc.type === "intraday" && doc.symbol && (
            <a href={`#/symbol/${encodeURIComponent(doc.symbol)}`}>驾驶舱 ↗</a>
          )}
          {doc.symbol && <TopbarQuote symbol={doc.symbol} />}
        </span>
      </div>
      <div className="detail-body">
        {doc.built.kind === "simple" && <SimpleChartView built={doc.built} />}
        {!["simple", "sepa", "intraday"].includes(doc.built.kind) && (
          <div className="error-box">该图表格式已不再支持，请重新生成（旧格式重建失败）</div>
        )}
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
