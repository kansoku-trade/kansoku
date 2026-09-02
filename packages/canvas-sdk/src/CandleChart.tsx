import { useEffect, useRef } from 'react';
import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { CandleFeed, TimeframeKey } from '@kansoku/shared/types';
import { theme } from './theme.js';
import { applyFeed, createFeedChart, type FeedChart } from './candleFeed.js';

export interface CanvasBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface CanvasMacdPoint {
  time: number;
  macd: number;
  signal: number;
  hist: number;
}

export interface CanvasEmaSeries {
  label?: string;
  points: { time: number; value: number }[];
}

export interface CandleChartProps {
  title?: string;
  bars?: CanvasBar[];
  source?: CandleFeed | null;
  tf?: TimeframeKey;
  volume?: boolean | { time: number; value: number }[];
  macd?: CanvasMacdPoint[];
  ema?: number[] | CanvasEmaSeries[];
  priceLines?: { price: number; label: string }[];
  zones?: { low: number; high: number; kind?: string; label?: string }[];
  markers?: {
    time: number;
    price?: number;
    bias?: 'bullish' | 'bearish' | string;
    label?: string;
  }[];
  sessions?: boolean | { start: number; end: number; kind?: string }[];
}

function asTime(time: number): UTCTimestamp {
  return time as UTCTimestamp;
}

function emaSeries(ema: CandleChartProps['ema']): CanvasEmaSeries[] {
  if (!ema) return [];
  return ema.filter(
    (item): item is CanvasEmaSeries => typeof item === 'object' && Array.isArray(item.points),
  );
}

type OverlaySeries = Pick<ISeriesApi<'Candlestick'>, 'createPriceLine'>;

function drawOverlays(
  candle: OverlaySeries,
  priceLines: CandleChartProps['priceLines'],
  zones: CandleChartProps['zones'],
  markers: CandleChartProps['markers'],
): void {
  for (const line of priceLines ?? []) {
    candle.createPriceLine({
      price: line.price,
      color: theme.accent,
      lineWidth: 1,
      title: line.label,
      axisLabelVisible: true,
    });
  }
  for (const zone of zones ?? []) {
    candle.createPriceLine({
      price: zone.high,
      color: theme.down,
      lineWidth: 1,
      title: zone.label ?? zone.kind ?? 'zone',
      lineStyle: 2,
    });
    candle.createPriceLine({ price: zone.low, color: theme.down, lineWidth: 1, lineStyle: 2 });
  }
  if (!markers?.length) return;
  createSeriesMarkers(
    candle as ISeriesApi<'Candlestick'>,
    markers.map((marker) => ({
      time: asTime(marker.time) as Time,
      position: marker.bias === 'bullish' ? 'belowBar' : 'aboveBar',
      color: marker.bias === 'bullish' ? theme.up : theme.down,
      shape: marker.bias === 'bullish' ? 'arrowUp' : 'arrowDown',
      text: marker.label ?? '',
    })),
  );
}

export function CandleChart({
  title,
  bars,
  source,
  tf = 'm5',
  volume,
  macd,
  ema,
  priceLines,
  zones,
  markers,
}: CandleChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const feedRef = useRef<FeedChart | null>(null);
  if (source && bars) throw new Error('CandleChart: pass either source or bars');
  const hasSource = source != null;
  const feedData = source ? source.timeframes[tf] : null;
  const overlayKey = JSON.stringify([priceLines, zones, markers]);
  const overlayRef = useRef({ priceLines, zones, markers });
  overlayRef.current = { priceLines, zones, markers };
  const feedDataRef = useRef(feedData);
  feedDataRef.current = feedData;
  const appliedRef = useRef<typeof feedData>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !hasSource) return;
    const handles = createFeedChart(host);
    if (!handles) return;
    feedRef.current = handles;
    const overlay = overlayRef.current;
    drawOverlays(handles.candle, overlay.priceLines, overlay.zones, overlay.markers);
    if (feedDataRef.current) {
      applyFeed(handles, feedDataRef.current);
      appliedRef.current = feedDataRef.current;
    }
    const resize = () =>
      handles.chart.applyOptions({ width: host.clientWidth, height: host.clientHeight });
    const Observer = globalThis.ResizeObserver;
    const observer = Observer ? new Observer(resize) : null;
    observer?.observe(host);
    return () => {
      observer?.disconnect();
      feedRef.current = null;
      handles.chart.remove();
    };
  }, [hasSource, overlayKey, tf]);

  useEffect(() => {
    const handles = feedRef.current;
    if (!handles || !feedData || appliedRef.current === feedData) return;
    applyFeed(handles, feedData);
    appliedRef.current = feedData;
  }, [feedData]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !bars?.length) return;
    let chart: ReturnType<typeof createChart>;
    try {
      chart = createChart(host, {
        width: host.clientWidth,
        height: host.clientHeight,
        layout: { background: { color: theme.bgSurface }, textColor: theme.textSecondary },
        grid: {
          vertLines: { color: theme.gridLine },
          horzLines: { color: theme.gridLine },
        },
        rightPriceScale: { borderColor: theme.border },
        timeScale: { borderColor: theme.border, timeVisible: true, secondsVisible: false },
      });
    } catch {
      return;
    }
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: theme.up,
      downColor: theme.down,
      borderVisible: false,
      wickUpColor: theme.up,
      wickDownColor: theme.down,
    });
    candle.setData(
      bars.map((bar) => ({
        time: asTime(bar.time),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      })),
    );

    const volumeRows = Array.isArray(volume)
      ? volume
      : volume
        ? bars
            .filter((bar) => bar.volume != null)
            .map((bar) => ({ time: bar.time, value: bar.volume as number }))
        : [];
    if (volumeRows.length) {
      const vol = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });
      vol.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
      vol.setData(
        volumeRows.map((row, index) => ({
          time: asTime(row.time),
          value: row.value,
          color: (bars[index]?.close ?? 0) >= (bars[index]?.open ?? 0) ? theme.up : theme.down,
        })),
      );
    }

    for (const [index, series] of emaSeries(ema).entries()) {
      const line = chart.addSeries(LineSeries, {
        color: index === 0 ? theme.accent : theme.textSecondary,
        lineWidth: 1,
        priceLineVisible: false,
      });
      line.setData(
        series.points.map((point) => ({ time: asTime(point.time), value: point.value })),
      );
    }

    drawOverlays(candle, priceLines, zones, markers);
    if (macd?.length) {
      const hist = chart.addSeries(HistogramSeries, { priceScaleId: 'macd' });
      hist.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      hist.setData(
        macd.map((point) => ({
          time: asTime(point.time),
          value: point.hist,
          color: point.hist >= 0 ? theme.up : theme.down,
        })),
      );
    }

    chart.timeScale().fitContent();
    const resize = () => chart.applyOptions({ width: host.clientWidth, height: host.clientHeight });
    const Observer = globalThis.ResizeObserver;
    const observer = Observer ? new Observer(resize) : null;
    observer?.observe(host);
    return () => {
      observer?.disconnect();
      chart.remove();
    };
  }, [bars, ema, macd, markers, priceLines, volume, zones]);

  const waiting = !feedData && !bars?.length;

  return (
    <div style={{ margin: '8px 0 16px' }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: theme.textPrimary, marginBottom: 8 }}>
        {title?.trim() ? title : 'Untitled'}
      </div>
      <div
        ref={hostRef}
        style={{
          width: '100%',
          height: 280,
          background: theme.bgSurface,
          display: waiting ? 'flex' : 'block',
          alignItems: 'center',
          justifyContent: 'center',
          color: theme.textMuted,
          fontSize: 12,
        }}
      >
        {waiting ? '等待行情…' : null}
      </div>
    </div>
  );
}
