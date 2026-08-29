import { Component, lazy, Suspense, useMemo, useRef, useState, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { IntradayBuilt } from '@kansoku/shared/types';
import { fmt } from '@web/lib/format';
import { colors, radii } from '../../../theme/tokens.stylex';
import type { DrawingsHandle } from '../drawings/useDrawings';
import { namespacedKey, useIntradayControls } from './controlsContext';
import { isSessionlessTf, tfDataOf, type ChartTf } from './timeframes';
import { useMaSeries } from './useMaLines';
import { useIntradayCharts, type DrawingChartHandle } from './useIntradayCharts';

const MACD_MIN = 100;
const MACD_MAX = 340;
const MACD_DEFAULT = 190;
const MACD_HEIGHT_KEY = 'intraday-macd-height';

const styles = stylex.create({
  mainChart: {
    flex: '1 1 auto',
    minHeight: 0,
  },
  macdChart: {
    borderBottomStyle: 'none',
    borderBottomWidth: 0,
    minHeight: 0,
  },
  resizer: {
    backgroundColor: colors.backgroundSurface,
    cursor: 'row-resize',
    flex: '0 0 6px',
    position: 'relative',
    touchAction: 'none',
    zIndex: 11,
    '::after': {
      backgroundColor: colors.borderStrong,
      borderRadius: radii.default,
      content: '""',
      height: '2px',
      left: '50%',
      marginLeft: '-18px',
      position: 'absolute',
      top: '2px',
      width: '36px',
    },
    ':hover': {
      backgroundColor: colors.backgroundHover,
    },
    ':hover::after': {
      backgroundColor: colors.accent,
    },
  },
  resizerDragging: {
    backgroundColor: colors.backgroundHover,
    '::after': {
      backgroundColor: colors.accent,
    },
  },
});

const clampMacdHeight = (h: number) => Math.min(MACD_MAX, Math.max(MACD_MIN, h));

const DrawingsLayer = lazy(() =>
  import('./DrawingsLayer').then((m) => ({ default: m.DrawingsLayer })),
);

class DrawingsBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export interface IntradayChartOnlyProps {
  symbol: string;
  built: IntradayBuilt;
  activeTf: ChartTf;
  onLoadHistory?: () => void;
  drawings?: boolean;
  storageNamespace?: string;
  onChartHandle?: (handle: DrawingChartHandle | null) => void;
}

export function IntradayChartOnly({
  symbol,
  built,
  activeTf,
  onLoadHistory,
  drawings = true,
  storageNamespace,
  onChartHandle,
}: IntradayChartOnlyProps) {
  const macdHeightKey = namespacedKey(MACD_HEIGHT_KEY, storageNamespace);
  const [macdHeight, setMacdHeight] = useState(() => {
    const saved = Number(localStorage.getItem(macdHeightKey));
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
    (handle) => {
      setDrawingHandle(handle);
      onChartHandle?.(handle);
    },
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
        localStorage.setItem(macdHeightKey, String(h));
        return h;
      });
    };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
  };

  return (
    <div className="charts-col">
      <div className={`chart-block ${stylex.props(styles.mainChart).className}`}>
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
          <DrawingsBoundary>
            <Suspense fallback={null}>
              <DrawingsLayer symbol={symbol} handle={drawingHandle} barTimes={barTimes} />
            </Suspense>
          </DrawingsBoundary>
        )}
        <div ref={mainRef} className="chart-host" />
      </div>
      <div
        className={`pane-resizer ${stylex.props(styles.resizer, dragging && styles.resizerDragging).className}`}
        title="拖动调整 MACD 高度"
        onPointerDown={onResizeStart}
      />
      <div
        className={`chart-block macd ${stylex.props(styles.macdChart).className}`}
        style={{ flex: `0 0 ${macdHeight}px` }}
      >
        <div className="chart-label">MACD (12,26,9)</div>
        <div ref={macdRef} className="chart-host" />
      </div>
    </div>
  );
}
