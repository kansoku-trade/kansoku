import { useMemo, useRef, useState, type ReactNode } from "react";
import type { IntradayBuilt, QuoteCell, TimeframeKey } from "@kansoku/shared/types";
import { fmt } from "@web/format";
import type { SidebarTab } from "../SidebarTabs";
import { DrawingToolbar } from "../drawings/DrawingToolbar";
import { useDrawings, type DrawingsHandle } from "../drawings/useDrawings";
import { LayerPanel, type LayerGroup } from "../LayerPanel";
import type { ConclusionReassess } from "./ConclusionCard";
import { IntradaySidebar } from "./IntradaySidebar";
import {
  INDICATOR_TOGGLE_COLORS,
  INDICATOR_TOGGLE_LABELS,
  INDICATOR_TOGGLE_ORDER,
  useIndicatorToggles,
} from "./useIndicatorToggles";
import { EMA_COLORS, useIntradayCharts } from "./useIntradayCharts";

export const TF_LABELS: Record<TimeframeKey, string> = { m5: "5分钟", m15: "15分钟", h1: "1小时" };
const TF_SHORT_LABELS: Record<TimeframeKey, string> = { m5: "5m", m15: "15m", h1: "1h" };
const TF_ORDER: TimeframeKey[] = ["m5", "m15", "h1"];

const MACD_MIN = 100;
const MACD_MAX = 340;
const MACD_DEFAULT = 190;
const MACD_HEIGHT_KEY = "intraday-macd-height";

const clampMacdHeight = (h: number) => Math.min(MACD_MAX, Math.max(MACD_MIN, h));

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
        <button key={k} aria-pressed={k === activeTf} onClick={() => onChange(k)} title={TF_LABELS[k]}>
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

export function IntradayChartOnly({ symbol, built, activeTf, onLoadHistory }: IntradayChartOnlyProps) {
  const [macdHeight, setMacdHeight] = useState(() => {
    const saved = Number(localStorage.getItem(MACD_HEIGHT_KEY));
    return Number.isFinite(saved) && saved > 0 ? clampMacdHeight(saved) : MACD_DEFAULT;
  });
  const [dragging, setDragging] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const macdRef = useRef<HTMLDivElement>(null);
  const { toggles, set: setToggle } = useIndicatorToggles();
  const [drawingHandle, setDrawingHandle] = useState<DrawingsHandle | null>(null);
  useIntradayCharts(built, activeTf, mainRef, macdRef, onLoadHistory, toggles, setDrawingHandle);
  const barTimes = useMemo(
    () => built.timeframes[activeTf]?.candles.map((c) => c.time) ?? [],
    [built, activeTf],
  );
  const drawingsApi = useDrawings(drawingHandle, symbol, barTimes);
  const layerGroups = useMemo<LayerGroup[]>(
    () => [
      {
        items: INDICATOR_TOGGLE_ORDER.map((key) => ({
          key,
          label: INDICATOR_TOGGLE_LABELS[key],
          color: INDICATOR_TOGGLE_COLORS[key],
          toggle: (v: boolean) => setToggle(key, v),
        })),
      },
    ],
    [setToggle],
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
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      setDragging(false);
      setMacdHeight((h) => {
        localStorage.setItem(MACD_HEIGHT_KEY, String(h));
        return h;
      });
    };
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
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
            <span className="swatch" style={{ background: "rgba(232,232,232,0.3)" }} />
            盘前/盘后
          </span>
          <span>
            <span className="swatch" style={{ background: "rgba(70,100,180,0.7)" }} />
            夜盘
          </span>
        </div>
        <LayerPanel groups={layerGroups} checked={toggles} />
        <DrawingToolbar api={drawingsApi} />
        <div ref={mainRef} className="chart-host" />
      </div>
      <div
        className={`pane-resizer${dragging ? " dragging" : ""}`}
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
      <IntradayChartOnly symbol={symbol} built={built} activeTf={activeTf} onLoadHistory={onLoadHistory} />
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
