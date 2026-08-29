import * as stylex from '@stylexjs/stylex';
import { IntradayChartOnly, IntradayTimeframeSwitch } from './intraday/IntradayDashboard';
import { ChartLayerMenu } from './intraday/ChartLayerMenu';
import { MaLinesMenu } from './intraday/MaLinesMenu';
import { tfDataOf, withViewTimeframe } from './intraday/timeframes';
import { useViewTimeframe } from './intraday/useViewTimeframe';
import { IntradayControlsProvider } from './intraday/controlsContext';
import { getShellRpc } from '../desktop/shellRpc';
import { resolveIntradayTf } from './intraday/useIntradayDoc';
import { useIntradayPreview } from './intraday/useIntradayPreview';
import { TopbarQuote } from '../quotes/QuoteBar';
import { Dot, Empty, ErrorBox } from '../../ui';
import { useLiveQuote } from '../quotes/useLiveQuote';
import { useTitle } from '../../lib/useTitle';
import { colors, fontSizes } from '../../theme/tokens.stylex';

const styles = stylex.create({
  shell: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
  },
  header: {
    alignItems: 'center',
    backgroundColor: colors.backgroundSurface,
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    display: 'flex',
    flexShrink: 0,
    gap: '10px',
    padding: '8px 12px',
    fontSize: fontSizes.md,
    userSelect: 'none',
    WebkitAppRegion: 'drag',
  },
  symbol: {
    color: colors.textPrimary,
    fontWeight: 600,
  },
  trafficSpacer: {
    flex: '0 0 66px',
  },
  chartTail: {
    alignItems: 'center',
    display: 'inline-flex',
    gap: '8px',
    marginLeft: 'auto',
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
});

export function PopoutChartWindow({ sym }: { sym: string }) {
  const symLabel = sym.toUpperCase().replace(/\.US$/, '');
  const liveQuote = useLiveQuote(sym);
  const { built, error, degraded, intradayTf, setIntradayTf } = useIntradayPreview(sym);
  const isDesktop = getShellRpc() !== null;
  useTitle(symLabel);
  const viewTimeframe = useViewTimeframe(sym, intradayTf ?? 'm15', { live: true, liveQuote });
  const activeTf = built ? resolveIntradayTf(built, intradayTf) : null;
  const chartBuilt =
    built && activeTf ? withViewTimeframe(built, activeTf, viewTimeframe.tf) : built;

  return (
    <IntradayControlsProvider>
      <div className={`popout-shell ${stylex.props(styles.shell).className}`}>
        <div className={`popout-header ${stylex.props(styles.header).className}`}>
          {isDesktop && (
            <div
              className={`popout-traffic-spacer ${stylex.props(styles.trafficSpacer).className}`}
            />
          )}
          <span className={`popout-symbol ${stylex.props(styles.symbol).className}`}>
            {symLabel}
          </span>
          {degraded && <Dot tone="accent" pulse title="数据延迟：行情拉取失败，正在重试" />}
          {activeTf && <IntradayTimeframeSwitch activeTf={activeTf} onChange={setIntradayTf} />}
          <span className={`topbar-chart-tail ${stylex.props(styles.chartTail).className}`}>
            {chartBuilt && activeTf && (
              <>
                <MaLinesMenu candles={tfDataOf(chartBuilt, activeTf)?.candles ?? []} />
                <ChartLayerMenu built={chartBuilt} activeTf={activeTf} />
              </>
            )}
            <TopbarQuote quote={liveQuote} />
          </span>
        </div>
        <div className={`popout-body ${stylex.props(styles.body).className}`}>
          {error ? (
            <ErrorBox>{error}</ErrorBox>
          ) : !chartBuilt || !activeTf ? (
            <Empty>加载中…</Empty>
          ) : (
            <IntradayChartOnly symbol={sym} built={chartBuilt} activeTf={activeTf} />
          )}
        </div>
      </div>
    </IntradayControlsProvider>
  );
}
