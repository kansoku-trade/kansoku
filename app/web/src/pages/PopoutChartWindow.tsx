import { IntradayChartOnly } from "../charts/intraday/IntradayDashboard";
import { resolveIntradayTf } from "../charts/intraday/useIntradayDoc";
import { useIntradayPreview } from "../charts/intraday/useIntradayPreview";
import { TopbarQuote } from "../QuoteBar";
import { Dot, Empty, ErrorBox } from "../ui";
import { useLiveQuote } from "../useLiveQuote";
import { useTitle } from "../useTitle";

export function PopoutChartWindow({ sym }: { sym: string }) {
  const symLabel = sym.toUpperCase().replace(/\.US$/, "");
  const liveQuote = useLiveQuote(sym);
  const { built, error, degraded, intradayTf } = useIntradayPreview(sym);
  useTitle(symLabel);

  return (
    <div className="popout-shell">
      <div className="popout-header">
        <span className="popout-symbol">{symLabel}</span>
        {degraded && <Dot tone="accent" pulse title="数据延迟：行情拉取失败，正在重试" />}
        <TopbarQuote quote={liveQuote} />
      </div>
      <div className="popout-body">
        {error ? (
          <ErrorBox>{error}</ErrorBox>
        ) : !built ? (
          <Empty>加载中…</Empty>
        ) : (
          <IntradayChartOnly symbol={sym} built={built} activeTf={resolveIntradayTf(built, intradayTf)} />
        )}
      </div>
    </div>
  );
}
