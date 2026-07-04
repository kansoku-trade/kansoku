import { useRef, useState } from "react";
import type { IntradayBuilt, TimeframeKey } from "../../../../shared/types";
import { fmt } from "../../format";
import type { SidebarTab } from "../SidebarTabs";
import { IndicatorToggles } from "./IndicatorToggles";
import { IntradaySidebar } from "./IntradaySidebar";
import { useIndicatorToggles } from "./useIndicatorToggles";
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
  built: IntradayBuilt;
  activeTf: TimeframeKey;
  predictionUpdatedAt?: string;
  predictionStale?: boolean;
  onLoadHistory?: () => void;
  sidebarTabs?: SidebarTab[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
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

export function IntradayDashboard({
  built,
  activeTf,
  predictionUpdatedAt,
  predictionStale,
  onLoadHistory,
  sidebarTabs,
  activeTab,
  onTabChange,
}: IntradayDashboardProps) {
  const [macdHeight, setMacdHeight] = useState(() => {
    const saved = Number(localStorage.getItem(MACD_HEIGHT_KEY));
    return Number.isFinite(saved) && saved > 0 ? clampMacdHeight(saved) : MACD_DEFAULT;
  });
  const [dragging, setDragging] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const macdRef = useRef<HTMLDivElement>(null);
  const { toggles, toggle } = useIndicatorToggles();
  useIntradayCharts(built, activeTf, mainRef, macdRef, onLoadHistory, toggles);

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
    <div className="layout">
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
              <span className="swatch" style={{ background: "rgba(88,166,255,0.4)" }} />
              盘前/盘后 · 深色为夜盘
            </span>
          </div>
          <IndicatorToggles toggles={toggles} onToggle={toggle} />
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
      <IntradaySidebar
        built={built}
        activeTf={activeTf}
        predictionUpdatedAt={predictionUpdatedAt}
        predictionStale={predictionStale}
        tabsOverride={sidebarTabs}
        active={activeTab}
        onActiveChange={onTabChange}
      />
    </div>
  );
}
