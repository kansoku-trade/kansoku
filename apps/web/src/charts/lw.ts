import {
  createChart,
  createSeriesMarkers,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type LineData,
  type LogicalRange,
  type SeriesMarker as LwMarker,
  type SeriesType,
  type TickMarkType,
  type Time,
  type UTCTimestamp,
  type WhitespaceData,
} from 'lightweight-charts';
import { formatMarketDateTime, formatMarketTick } from '@kansoku/shared/time';
import type { Candle, ColoredPoint, LinePoint, SeriesMarker } from '@kansoku/shared/types';
import { theme } from '../theme';

export const asTime = (t: number) => t as UTCTimestamp;

export const toLineData = (pts: LinePoint[]): LineData[] =>
  pts.map((p) => ({ time: asTime(p.time), value: p.value }));

export const toHistData = (pts: ColoredPoint[]): HistogramData[] =>
  pts.map((p) => ({ time: asTime(p.time), value: p.value, color: p.color }));

const hexToRgba = (hex: string | undefined, alpha: number): string | undefined => {
  if (!hex || !/^#[\da-f]{6}$/i.test(hex)) return hex;
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

export const toVolumeData = (pts: ColoredPoint[]): HistogramData[] =>
  pts.map((p) => ({ time: asTime(p.time), value: p.value, color: hexToRgba(p.color, 0.45) }));

export const toCandleData = (cs: Candle[]): CandlestickData[] =>
  cs.map((c) => ({ time: asTime(c.time), open: c.open, high: c.high, low: c.low, close: c.close }));

export function padLineData(pts: LinePoint[], timeline: number[]): (LineData | WhitespaceData)[] {
  const byTime = new Map(pts.map((p) => [p.time, p.value]));
  return timeline.map((t) => {
    const v = byTime.get(t);
    return v === undefined ? { time: asTime(t) } : { time: asTime(t), value: v };
  });
}

export function padHistData(
  pts: ColoredPoint[],
  timeline: number[],
): (HistogramData | WhitespaceData)[] {
  const byTime = new Map(pts.map((p) => [p.time, p]));
  return timeline.map((t) => {
    const p = byTime.get(t);
    return p === undefined
      ? { time: asTime(t) }
      : { time: asTime(t), value: p.value, color: p.color };
  });
}

export const toMarkers = (ms: SeriesMarker[]): LwMarker<Time>[] =>
  ms.map((m) => ({
    time: asTime(m.time),
    position: m.position,
    color: m.color,
    shape: m.shape,
    text: m.text,
    id: m.id,
  }));

export function attachMarkers(
  series: ISeriesApi<SeriesType>,
  markers: SeriesMarker[] = [],
): ISeriesMarkersPluginApi<Time> {
  return createSeriesMarkers(series, toMarkers(markers));
}

export interface MarkerTooltipHandle {
  setMarkers(ms: SeriesMarker[]): void;
  destroy(): void;
}

export function markerTooltip(chart: IChartApi, host: HTMLElement): MarkerTooltipHandle {
  const el = document.createElement('div');
  el.className = 'marker-tooltip';
  host.appendChild(el);
  let byId = new Map<string, string>();

  const onMove = (param: Parameters<Parameters<IChartApi['subscribeCrosshairMove']>[0]>[0]) => {
    const id = typeof param.hoveredObjectId === 'string' ? param.hoveredObjectId : undefined;
    const tip = id ? byId.get(id) : undefined;
    if (tip && param.point) {
      el.textContent = tip;
      el.style.display = 'block';
      const x = Math.max(4, Math.min(param.point.x + 14, host.clientWidth - el.offsetWidth - 8));
      const y = Math.max(4, Math.min(param.point.y + 14, host.clientHeight - el.offsetHeight - 8));
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    } else {
      el.style.display = 'none';
    }
  };
  chart.subscribeCrosshairMove(onMove);

  return {
    setMarkers(ms: SeriesMarker[]) {
      byId = new Map(
        ms.filter((m) => m.id && m.tooltip).map((m) => [m.id as string, m.tooltip as string]),
      );
    },
    destroy() {
      chart.unsubscribeCrosshairMove(onMove);
      el.remove();
    },
  };
}

const marketTimeFormatter = (time: Time): string =>
  typeof time === 'number' ? formatMarketDateTime(time) : String(time);

const marketTickMarkFormatter = (time: Time, tickMarkType: TickMarkType): string | null =>
  typeof time === 'number' ? formatMarketTick(time, tickMarkType) : null;

export function baseChart(el: HTMLElement, timeVisible: boolean, marketTime = false): IChartApi {
  return createChart(el, {
    width: el.clientWidth,
    height: el.clientHeight,
    layout: { background: { color: theme.bgSurface }, textColor: theme.textSecondary },
    grid: {
      vertLines: { color: theme.gridLine, style: 0 },
      horzLines: { color: theme.gridLine, style: 0 },
    },
    crosshair: { mode: 0 },
    // minimumWidth pins the axis width so live price ticks with varying digit
    // counts don't resize the pane and make the chart jitter horizontally.
    rightPriceScale: { borderColor: theme.border, minimumWidth: 64 },
    localization: marketTime
      ? {
          timeFormatter: marketTimeFormatter,
        }
      : undefined,
    timeScale: {
      borderColor: theme.border,
      timeVisible,
      secondsVisible: false,
      tickMarkFormatter: marketTime ? marketTickMarkFormatter : undefined,
    },
  });
}

export interface PriceLineSpec {
  price: number;
  color: string;
  lineWidth?: number;
  lineStyle?: number;
  axisLabelVisible?: boolean;
  title?: string;
}

type AnySeries = ISeriesApi<SeriesType>;

export function addPriceLine(series: AnySeries, spec: PriceLineSpec) {
  return series.createPriceLine({
    price: spec.price,
    color: spec.color,
    lineWidth: (spec.lineWidth ?? 1) as never,
    lineStyle: (spec.lineStyle ?? 0) as never,
    axisLabelVisible: spec.axisLabelVisible ?? true,
    title: spec.title ?? '',
  });
}

export interface Togglable {
  set(v: boolean): void;
}

export function makeTogglableLine(series: AnySeries, spec: PriceLineSpec): Togglable {
  let ref: ReturnType<typeof addPriceLine> | null = addPriceLine(series, spec);
  let visible = true;
  return {
    set(v: boolean) {
      if (v === visible) return;
      if (v) {
        ref = addPriceLine(series, spec);
      } else if (ref) {
        series.removePriceLine(ref);
        ref = null;
      }
      visible = v;
    },
  };
}

export function syncTimeScales(charts: IChartApi[]): () => void {
  let syncing = false;
  const subscriptions = charts.map((src) => {
    const onRangeChange = (range: LogicalRange | null) => {
      if (syncing || !range) return;
      syncing = true;
      charts.forEach((dst) => {
        if (dst !== src) dst.timeScale().setVisibleLogicalRange(range);
      });
      syncing = false;
    };
    src.timeScale().subscribeVisibleLogicalRangeChange(onRangeChange);
    return () => src.timeScale().unsubscribeVisibleLogicalRangeChange(onRangeChange);
  });
  return () => subscriptions.forEach((unsubscribe) => unsubscribe());
}

export function centerLastBar(chart: IChartApi, candles: Candle[], n = 90): void {
  if (!candles.length) return;
  const last = candles.length - 1;
  chart.timeScale().setVisibleLogicalRange({ from: last - n / 2, to: last + n / 2 });
}

export function showLastBars(chart: IChartApi, candles: Candle[], n = 90): void {
  if (!candles.length) return;
  const lastTs = candles.at(-1)!.time;
  const startTs = candles[Math.max(0, candles.length - n)].time;
  chart.timeScale().setVisibleRange({ from: asTime(startTs), to: asTime(lastTs) });
}

export interface SizeObserverHandle {
  disconnect(): void;
}

export function observeSize(el: HTMLElement, chart: IChartApi): SizeObserverHandle {
  let active = true;
  const ro = new ResizeObserver(() => {
    if (!active) return;
    chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
  });
  ro.observe(el);
  return {
    disconnect() {
      active = false;
      ro.disconnect();
    },
  };
}
