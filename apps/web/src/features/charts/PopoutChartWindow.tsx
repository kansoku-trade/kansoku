import { IntradayChartOnly } from './intraday/IntradayDashboard';
import { getShellRpc } from '../desktop/shellRpc';
import { resolveIntradayTf } from './intraday/useIntradayDoc';
import { useIntradayPreview } from './intraday/useIntradayPreview';
import { TopbarQuote } from '../quotes/QuoteBar';
import { Dot, Empty, ErrorBox } from '../../ui';
import { useLiveQuote } from '../quotes/useLiveQuote';
import { useTitle } from '../../lib/useTitle';

export function PopoutChartWindow({ sym }: { sym: string }) {
  const symLabel = sym.toUpperCase().replace(/\.US$/, '');
  const liveQuote = useLiveQuote(sym);
  const { built, error, degraded, intradayTf } = useIntradayPreview(sym);
  const isDesktop = getShellRpc() !== null;
  useTitle(symLabel);

  return (
    <div className="popout-shell">
      <div className="popout-header">
        {isDesktop && <div className="popout-traffic-spacer" />}
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
          <IntradayChartOnly
            symbol={sym}
            built={built}
            activeTf={resolveIntradayTf(built, intradayTf)}
          />
        )}
      </div>
    </div>
  );
}
