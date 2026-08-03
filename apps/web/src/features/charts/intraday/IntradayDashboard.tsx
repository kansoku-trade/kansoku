import type { ReactNode } from 'react';
import type { IntradayBuilt, QuoteCell, TimeframeKey } from '@kansoku/shared/types';
import type { SidebarTab } from '../SidebarTabs';
import type { ConclusionReassess } from './ConclusionCard';
import { IntradayChartOnly } from './IntradayChartOnly';
import { IntradaySidebar } from './IntradaySidebar';
import { useIntradayControls } from './controlsContext';
import { TimeframeSettingsMenu } from './TimeframeSettingsMenu';
import { isViewPeriod, tfLabel, tfShortLabel, type ChartTf } from './timeframes';

export const TF_LABELS: Record<TimeframeKey, string> = { m5: '5分钟', m15: '15分钟', h1: '1小时' };

export { IntradayChartOnly } from './IntradayChartOnly';

interface IntradayDashboardProps {
  symbol: string;
  built: IntradayBuilt;
  activeTf: ChartTf;
  predictionUpdatedAt?: string;
  predictionStale?: boolean;
  conclusionReassess?: ConclusionReassess;
  onLoadHistory?: () => void;
  sidebarTabs?: SidebarTab[];
  extraTabs?: SidebarTab[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
  dock?: ReactNode;
  liveQuote?: QuoteCell | null;
}

export function IntradayTimeframeSwitch({
  activeTf,
  onChange,
}: {
  activeTf: ChartTf;
  onChange: (tf: ChartTf) => void;
}) {
  const { visibleTfs } = useIntradayControls();
  return (
    <div className="chart-timeframe-switch" aria-label="时间周期">
      {visibleTfs.map((k) => (
        <button
          key={k}
          aria-pressed={k === activeTf}
          onClick={() => onChange(k)}
          title={tfLabel(k)}
        >
          {tfShortLabel(k)}
        </button>
      ))}
      <TimeframeSettingsMenu />
    </div>
  );
}

export function IntradayDashboard({
  symbol,
  built,
  activeTf,
  predictionUpdatedAt,
  predictionStale,
  conclusionReassess,
  onLoadHistory,
  sidebarTabs,
  extraTabs,
  activeTab,
  onTabChange,
  dock,
  liveQuote,
}: IntradayDashboardProps) {
  const sidebarTf = isViewPeriod(activeTf) ? built.defaultTf : activeTf;
  return (
    <div className="layout">
      <IntradayChartOnly
        symbol={symbol}
        built={built}
        activeTf={activeTf}
        onLoadHistory={onLoadHistory}
      />
      <IntradaySidebar
        built={built}
        activeTf={sidebarTf}
        predictionUpdatedAt={predictionUpdatedAt}
        predictionStale={predictionStale}
        conclusionReassess={conclusionReassess}
        tabsOverride={sidebarTabs}
        extraTabs={extraTabs}
        active={activeTab}
        onActiveChange={onTabChange}
        dock={dock}
        liveQuote={liveQuote}
      />
    </div>
  );
}
