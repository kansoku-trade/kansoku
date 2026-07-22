import { useMemo, useRef, useState, type ReactNode } from 'react';
import type { IntradayBuilt, QuoteCell, TimeframeKey } from '@kansoku/shared/types';
import type { FeatureKey } from '@kansoku/pro-api/features';
import { fmt } from '@web/lib/format';
import { useFeature } from '@web/features/edition/useFeature';
import type { SidebarTab } from '../SidebarTabs';
import { DrawingToolbar } from '../drawings/DrawingToolbar';
import { useDrawings, type DrawingsHandle } from '../drawings/useDrawings';
import { LayerPanel, type LayerGroup, type LayerItem, type LayerPreset } from '../LayerPanel';
import type { ConclusionReassess } from './ConclusionCard';
import { IntradaySidebar } from './IntradaySidebar';
import {
  CHAN_BUYSELL_TOGGLE_KEYS,
  CHAN_STRUCTURE_TOGGLE_KEYS,
  INDICATOR_FEATURE_GATES,
  INDICATOR_PRESETS,
  INDICATOR_TOGGLE_COLORS,
  INDICATOR_TOGGLE_LABELS,
  useIndicatorToggles,
  type IndicatorToggleKey,
} from './useIndicatorToggles';
import { EMA_COLORS, useIntradayCharts } from './useIntradayCharts';

export const TF_LABELS: Record<TimeframeKey, string> = { m5: '5分钟', m15: '15分钟', h1: '1小时' };
const TF_SHORT_LABELS: Record<TimeframeKey, string> = { m5: '5m', m15: '15m', h1: '1h' };
const TF_ORDER: TimeframeKey[] = ['m5', 'm15', 'h1'];

const MACD_MIN = 100;
const MACD_MAX = 340;
const MACD_DEFAULT = 190;
const MACD_HEIGHT_KEY = 'intraday-macd-height';

const clampMacdHeight = (h: number) => Math.min(MACD_MAX, Math.max(MACD_MIN, h));

const LAYER_GROUP_DEFS: { title: string; keys: IndicatorToggleKey[] }[] = [
  { title: '参照', keys: ['ema', 'vwap', 'levels', 'daylevel', 'optwall'] },
  { title: '结构', keys: ['fvg', 'pattern123', 'sb', 'candle'] },
  { title: '信号', keys: ['crosses', 'divergence', 'macdBeichi', 'ai'] },
];

const toLayerItem = (
  key: IndicatorToggleKey,
  setToggle: (key: IndicatorToggleKey, value: boolean) => void,
): LayerItem => ({
  key,
  label: INDICATOR_TOGGLE_LABELS[key],
  color: INDICATOR_TOGGLE_COLORS[key],
  toggle: (v: boolean) => setToggle(key, v),
});

interface IntradayDashboardProps {
  symbol: string;
  built: IntradayBuilt;
  activeTf: TimeframeKey;
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
  activeTf: TimeframeKey;
  onChange: (tf: TimeframeKey) => void;
}) {
  return (
    <div className="chart-timeframe-switch" aria-label="时间周期">
      {TF_ORDER.map((k) => (
        <button
          key={k}
          aria-pressed={k === activeTf}
          onClick={() => onChange(k)}
          title={TF_LABELS[k]}
        >
          {TF_SHORT_LABELS[k]}
        </button>
      ))}
    </div>
  );
}

interface IntradayChartOnlyProps {
  symbol: string;
  built: IntradayBuilt;
  activeTf: TimeframeKey;
  onLoadHistory?: () => void;
}

export function IntradayChartOnly({
  symbol,
  built,
  activeTf,
  onLoadHistory,
}: IntradayChartOnlyProps) {
  const [macdHeight, setMacdHeight] = useState(() => {
    const saved = Number(localStorage.getItem(MACD_HEIGHT_KEY));
    return Number.isFinite(saved) && saved > 0 ? clampMacdHeight(saved) : MACD_DEFAULT;
  });
  const [dragging, setDragging] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const macdRef = useRef<HTMLDivElement>(null);
  const {
    toggles,
    set: setToggle,
    applyPreset,
    markerRange,
    setMarkerRange,
  } = useIndicatorToggles();
  const [drawingHandle, setDrawingHandle] = useState<DrawingsHandle | null>(null);
  const autoPatternsFeature = useFeature('auto-patterns');
  const optionsWallsFeature = useFeature('options-walls');
  const gatedFeatures: Partial<Record<FeatureKey, typeof autoPatternsFeature>> = {
    'auto-patterns': autoPatternsFeature,
    'options-walls': optionsWallsFeature,
  };
  useIntradayCharts(
    built,
    activeTf,
    mainRef,
    macdRef,
    onLoadHistory,
    toggles,
    markerRange,
    setDrawingHandle,
  );
  const barTimes = useMemo(
    () => built.timeframes[activeTf]?.candles.map((c) => c.time) ?? [],
    [built, activeTf],
  );
  const drawingsApi = useDrawings(drawingHandle, symbol, barTimes);
  const lockedToggleKeys = useMemo(() => {
    const keys = new Set<IndicatorToggleKey>();
    for (const [key, featureKey] of Object.entries(INDICATOR_FEATURE_GATES) as [
      IndicatorToggleKey,
      FeatureKey,
    ][]) {
      if (!gatedFeatures[featureKey]?.active) keys.add(key);
    }
    return keys;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPatternsFeature.active, optionsWallsFeature.active]);
  const layerGroups: LayerGroup[] = useMemo(() => {
    const staticGroups = LAYER_GROUP_DEFS.map(({ title, keys }) => ({
      title,
      items: keys.map((key) => {
        const featureKey = INDICATOR_FEATURE_GATES[key];
        const locked = lockedToggleKeys.has(key);
        return {
          key,
          label: INDICATOR_TOGGLE_LABELS[key],
          color: INDICATOR_TOGGLE_COLORS[key],
          toggle: (v: boolean) => setToggle(key, v),
          locked,
          onLockedClick: featureKey ? () => gatedFeatures[featureKey]?.guard(() => {}) : undefined,
        };
      }),
    }));
    const chanStructureOn = CHAN_STRUCTURE_TOGGLE_KEYS.filter((key) => toggles[key]).length;
    const chanBuySellOn = CHAN_BUYSELL_TOGGLE_KEYS.filter((key) => toggles[key]).length;
    return [
      ...staticGroups,
      {
        title: `缠论结构 ${chanStructureOn}/${CHAN_STRUCTURE_TOGGLE_KEYS.length}`,
        items: CHAN_STRUCTURE_TOGGLE_KEYS.map((key) => toLayerItem(key, setToggle)),
      },
      {
        title: `缠论买卖点 ${chanBuySellOn}/${CHAN_BUYSELL_TOGGLE_KEYS.length}`,
        items: CHAN_BUYSELL_TOGGLE_KEYS.map((key) => toLayerItem(key, setToggle)),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedToggleKeys, setToggle, autoPatternsFeature.locked, optionsWallsFeature.locked, toggles]);
  const filteredPresets: LayerPreset[] = useMemo(
    () =>
      INDICATOR_PRESETS.map((p) => ({
        ...p,
        on: p.on.filter((key) => !lockedToggleKeys.has(key)),
      })),
    [lockedToggleKeys],
  );

  const onResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = macdHeight;
    setDragging(true);
    const onMove = (ev: PointerEvent) => {
      setMacdHeight(clampMacdHeight(startH + (startY - ev.clientY)));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      setDragging(false);
      setMacdHeight((h) => {
        localStorage.setItem(MACD_HEIGHT_KEY, String(h));
        return h;
      });
    };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
  };

  return (
    <div className="charts-col">
      <div className="chart-block intraday-main">
        <div className="chart-label">K 线 + 成交量</div>
        <div className="chart-legend">
          {(built.sidebar.technicals[activeTf]?.emas ?? []).map((e, i) => (
            <span key={e.period}>
              <span className="swatch" style={{ background: EMA_COLORS[i % EMA_COLORS.length] }} />
              EMA{e.period}
              {e.last !== null && ` $${fmt(e.last)}`}
            </span>
          ))}
          <span>
            <span className="swatch" style={{ background: 'rgba(232,232,232,0.3)' }} />
            盘前/盘后
          </span>
          <span>
            <span className="swatch" style={{ background: 'rgba(70,100,180,0.7)' }} />
            夜盘
          </span>
        </div>
        <LayerPanel
          groups={layerGroups}
          checked={toggles}
          presets={filteredPresets}
          onPreset={(on) => applyPreset(on as IndicatorToggleKey[])}
          range={markerRange}
          onRangeChange={setMarkerRange}
        />
        <DrawingToolbar api={drawingsApi} />
        <div ref={mainRef} className="chart-host" />
      </div>
      <div
        className={`pane-resizer${dragging ? ' dragging' : ''}`}
        title="拖动调整 MACD 高度"
        onPointerDown={onResizeStart}
      />
      <div className="chart-block macd" style={{ flex: `0 0 ${macdHeight}px` }}>
        <div className="chart-label">MACD (12,26,9)</div>
        <div ref={macdRef} className="chart-host" />
      </div>
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
        activeTf={activeTf}
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
