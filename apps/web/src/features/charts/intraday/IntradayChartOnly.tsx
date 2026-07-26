import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import type { IntradayBuilt } from '@kansoku/shared/types';
import { fmt } from '@web/lib/format';
import type { DrawingsHandle } from '../drawings/useDrawings';
import { useIntradayControls } from './controlsContext';
import { isSessionlessTf, tfDataOf, type ChartTf } from './timeframes';
import { useMaSeries } from './useMaLines';
import { useIntradayCharts } from './useIntradayCharts';

const MACD_MIN = 100;
const MACD_MAX = 340;
const MACD_DEFAULT = 190;
const MACD_HEIGHT_KEY = 'intraday-macd-height';

const clampMacdHeight = (h: number) => Math.min(MACD_MAX, Math.max(MACD_MIN, h));

const DrawingsLayer = lazy(() =>
  import('./DrawingsLayer').then((m) => ({ default: m.DrawingsLayer })),
);

export interface IntradayChartOnlyProps {
  symbol: string;
  built: IntradayBuilt;
  activeTf: ChartTf;
  onLoadHistory?: () => void;
  drawings?: boolean;
}

export function IntradayChartOnly({
  symbol,
  built,
  activeTf,
  onLoadHistory,
  drawings = true,
}: IntradayChartOnlyProps) {
  const [macdHeight, setMacdHeight] = useState(() => {
    const saved = Number(localStorage.getItem(MACD_HEIGHT_KEY));
    return Number.isFinite(saved) && saved > 0 ? clampMacdHeight(saved) : MACD_DEFAULT;
  });
  const [dragging, setDragging] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const macdRef = useRef<HTMLDivElement>(null);
  const { toggles, markerRange, maLines } = useIntradayControls();
  const [drawingHandle, setDrawingHandle] = useState<DrawingsHandle | null>(null);
  const candles = useMemo(() => tfDataOf(built, activeTf)?.candles ?? [], [built, activeTf]);
  const maSeries = useMaSeries(candles, maLines);
  useIntradayCharts(
    built,
    activeTf,
    mainRef,
    macdRef,
    onLoadHistory,
    toggles,
    markerRange,
    maSeries,
    setDrawingHandle,
  );
  const barTimes = useMemo(() => candles.map((c) => c.time), [candles]);

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
          {maSeries
            .filter((s) => s.line.visible)
            .map((s) => (
              <span key={s.line.id}>
                <span className="swatch" style={{ background: s.line.color }} />
                EMA{s.line.period}
                {s.last !== null && ` $${fmt(s.last)}`}
              </span>
            ))}
          {!isSessionlessTf(activeTf) && (
            <>
              <span>
                <span className="swatch" style={{ background: 'rgba(232,232,232,0.3)' }} />
                盘前/盘后
              </span>
              <span>
                <span className="swatch" style={{ background: 'rgba(70,100,180,0.7)' }} />
                夜盘
              </span>
            </>
          )}
        </div>
        {drawings && (
          <Suspense fallback={null}>
            <DrawingsLayer symbol={symbol} handle={drawingHandle} barTimes={barTimes} />
          </Suspense>
        )}
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
