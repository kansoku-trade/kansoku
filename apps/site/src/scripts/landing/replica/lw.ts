import {
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type LogicalRange,
  type MouseEventParams,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle } from '../kline';
import { theme } from './theme';

export const asTime = (value: number): UTCTimestamp => value as UTCTimestamp;

export const toCandleData = (candles: Candle[]): CandlestickData[] =>
  candles.map((candle) => ({
    time: asTime(candle.time),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  }));

export const toLineData = (
  times: number[],
  values: Array<number | null>,
): Array<LineData | { time: UTCTimestamp }> =>
  times.map((time, i) => {
    const value = values[i];
    return value === null || value === undefined
      ? { time: asTime(time) }
      : { time: asTime(time), value };
  });

const tickMark = (time: Time): string => {
  const date = new Date(Number(time) * 1000);
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

// Landing demo sits inside a scroll-driven page. Wheel zoom/pan would steal the
// gesture and stall Lenis / native scroll; keep drag and pinch only.
export const DEMO_HANDLE_SCROLL = {
  mouseWheel: false,
  pressedMouseMove: true,
  horzTouchDrag: true,
  vertTouchDrag: true,
} as const;

export const DEMO_HANDLE_SCALE = {
  mouseWheel: false,
  pinch: true,
  axisPressedMouseMove: true,
  axisDoubleClickReset: true,
} as const;

export const baseChart = (element: HTMLElement): IChartApi =>
  createChart(element, {
    width: element.clientWidth,
    height: element.clientHeight,
    autoSize: true,
    layout: { background: { color: theme.bgSurface }, textColor: theme.textSecondary },
    grid: {
      vertLines: { color: theme.gridLine, style: 0 },
      horzLines: { color: theme.gridLine, style: 0 },
    },
    crosshair: { mode: 0 },
    rightPriceScale: { borderColor: theme.border, minimumWidth: 64 },
    timeScale: {
      borderColor: theme.border,
      timeVisible: true,
      secondsVisible: false,
      // Marker text sits above the last bars; without headroom the axis clips it.
      rightOffset: 6,
      tickMarkFormatter: tickMark,
    },
    handleScroll: { ...DEMO_HANDLE_SCROLL },
    handleScale: { ...DEMO_HANDLE_SCALE },
  });

export const CONNECTOR_OPTIONS = {
  lineWidth: 1 as const,
  lineStyle: 2 as const,
  priceLineVisible: false,
  lastValueVisible: false,
  crosshairMarkerVisible: false,
};

export const syncTimeScales = (charts: IChartApi[]): (() => void) => {
  let syncing = false;
  const subscriptions = charts.map((source) => {
    const onRangeChange = (range: LogicalRange | null): void => {
      if (syncing || !range) return;
      syncing = true;
      for (const target of charts) {
        if (target !== source) target.timeScale().setVisibleLogicalRange(range);
      }
      syncing = false;
    };
    source.timeScale().subscribeVisibleLogicalRangeChange(onRangeChange);
    return () => source.timeScale().unsubscribeVisibleLogicalRangeChange(onRangeChange);
  });
  return () => subscriptions.forEach((stop) => stop());
};

export interface CrosshairPane {
  chart: IChartApi;
  series: ISeriesApi<SeriesType>;
}

export const syncCrosshair = (panes: CrosshairPane[]): (() => void) => {
  let syncing = false;
  const subscriptions = panes.map((source) => {
    const onMove = (param: MouseEventParams): void => {
      if (syncing) return;
      // Data updates on a pane holding a synthetic crosshair re-fire crosshairMove without
      // sourceEvent; forwarding those echoes makes the crosshair ping-pong between panes.
      if (param.time !== undefined && param.sourceEvent === undefined) return;
      syncing = true;
      for (const target of panes) {
        if (target === source) continue;
        if (param.time === undefined || param.logical === undefined) {
          target.chart.clearCrosshairPosition();
          continue;
        }
        const bar = target.series.dataByIndex(param.logical);
        const value =
          bar && 'value' in bar && bar.value !== undefined
            ? bar.value
            : bar && 'close' in bar
              ? bar.close
              : 0;
        target.chart.setCrosshairPosition(value, param.time, target.series);
      }
      syncing = false;
    };
    source.chart.subscribeCrosshairMove(onMove);
    return () => source.chart.unsubscribeCrosshairMove(onMove);
  });
  return () => subscriptions.forEach((stop) => stop());
};
