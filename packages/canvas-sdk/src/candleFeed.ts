import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApiBase,
  type IPrimitivePaneRenderer,
  type IPrimitivePaneView,
  type ISeriesApi,
  type ISeriesPrimitive,
  type PrimitivePaneViewZOrder,
  type SeriesAttachedParameter,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type {
  Candle,
  ColoredPoint,
  IntradayTfData,
  LinePoint,
  OffSessionSegment,
} from '@kansoku/shared/types';
import { seriesPalette, theme } from './theme.js';

const asTime = (time: number): UTCTimestamp => time as UTCTimestamp;

const offSessionColor = (kind: OffSessionSegment['kind']): string =>
  kind === 'overnight' ? 'rgba(70, 100, 180, 0.22)' : 'rgba(232, 232, 232, 0.08)';

class OffSessionRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly bands: { x: number; width: number; color: string }[]) {}

  draw(target: Parameters<IPrimitivePaneRenderer['draw']>[0]): void {
    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context;
      ctx.save();
      for (const band of this.bands) {
        if (band.width <= 0) continue;
        ctx.fillStyle = band.color;
        ctx.fillRect(band.x, 0, band.width, scope.mediaSize.height);
      }
      ctx.restore();
    });
  }
}

class OffSessionPaneView implements IPrimitivePaneView {
  private bands: { x: number; width: number; color: string }[] = [];

  constructor(private readonly source: OffSessionPrimitive) {}

  update(): void {
    const { chart, segments } = this.source.state();
    this.bands = [];
    if (!chart || !segments.length) return;
    const timeScale = chart.timeScale();
    const half = timeScale.options().barSpacing / 2;
    for (const segment of segments) {
      const start = timeScale.timeToCoordinate(segment.startTime as Time);
      const end = timeScale.timeToCoordinate(segment.endTime as Time);
      if (start === null || end === null) continue;
      const x = Math.round(start - half);
      this.bands.push({
        x,
        width: Math.round(end + half) - x,
        color: offSessionColor(segment.kind),
      });
    }
  }

  renderer(): IPrimitivePaneRenderer {
    return new OffSessionRenderer(this.bands);
  }

  zOrder(): PrimitivePaneViewZOrder {
    return 'bottom';
  }
}

export class OffSessionPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApiBase<Time> | null = null;
  private requestUpdate?: () => void;
  private segments: OffSessionSegment[] = [];
  private readonly paneView = new OffSessionPaneView(this);

  attached(param: SeriesAttachedParameter<Time>): void {
    this.chart = param.chart;
    this.requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this.chart = null;
    this.requestUpdate = undefined;
  }

  setData(segments: OffSessionSegment[]): void {
    this.segments = segments;
    this.requestUpdate?.();
  }

  updateAllViews(): void {
    this.paneView.update();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView];
  }

  state(): { chart: IChartApiBase<Time> | null; segments: OffSessionSegment[] } {
    return { chart: this.chart, segments: this.segments };
  }
}

const toCandle = (candle: Candle) => ({
  time: asTime(candle.time),
  open: candle.open,
  high: candle.high,
  low: candle.low,
  close: candle.close,
});

const toBar = (point: ColoredPoint, fallback: string) => ({
  time: asTime(point.time),
  value: point.value,
  color: point.color ?? fallback,
});

const toPoint = (point: LinePoint) => ({ time: asTime(point.time), value: point.value });

export interface FeedChart {
  chart: ReturnType<typeof createChart>;
  candle: ISeriesApi<'Candlestick'>;
  volume: ISeriesApi<'Histogram'>;
  hist: ISeriesApi<'Histogram'>;
  dif: ISeriesApi<'Line'>;
  dea: ISeriesApi<'Line'>;
  emas: ISeriesApi<'Line'>[];
  session: OffSessionPrimitive;
  lastTime: number | null;
}

export function createFeedChart(host: HTMLElement): FeedChart | null {
  let chart: ReturnType<typeof createChart>;
  try {
    chart = createChart(host, {
      width: host.clientWidth,
      height: host.clientHeight,
      layout: { background: { color: theme.bgSurface }, textColor: theme.textSecondary },
      grid: { vertLines: { color: theme.gridLine }, horzLines: { color: theme.gridLine } },
      rightPriceScale: { borderColor: theme.border },
      timeScale: { borderColor: theme.border, timeVisible: true, secondsVisible: false },
    });
  } catch {
    return null;
  }
  const candle = chart.addSeries(CandlestickSeries, {
    upColor: theme.up,
    downColor: theme.down,
    borderVisible: false,
    wickUpColor: theme.up,
    wickDownColor: theme.down,
  });
  const session = new OffSessionPrimitive();
  candle.attachPrimitive(session);
  const volume = chart.addSeries(HistogramSeries, {
    priceFormat: { type: 'volume' },
    priceScaleId: 'volume',
    priceLineVisible: false,
    lastValueVisible: false,
  });
  volume.priceScale().applyOptions({ scaleMargins: { top: 0.72, bottom: 0.18 } });
  const hist = chart.addSeries(HistogramSeries, {
    priceScaleId: 'macd',
    priceLineVisible: false,
    lastValueVisible: false,
  });
  hist.priceScale().applyOptions({ scaleMargins: { top: 0.86, bottom: 0 } });
  const dif = chart.addSeries(LineSeries, {
    color: theme.accent,
    lineWidth: 1,
    priceScaleId: 'macd',
    priceLineVisible: false,
  });
  const dea = chart.addSeries(LineSeries, {
    color: seriesPalette[4],
    lineWidth: 1,
    priceScaleId: 'macd',
    priceLineVisible: false,
  });
  chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.06, bottom: 0.32 } });
  return { chart, candle, volume, hist, dif, dea, emas: [], session, lastTime: null };
}

function emaLine(
  handles: FeedChart,
  index: number,
): { line: ISeriesApi<'Line'>; created: boolean } {
  const existing = handles.emas[index];
  if (existing) return { line: existing, created: false };
  const line = handles.chart.addSeries(LineSeries, {
    color: seriesPalette[index % seriesPalette.length],
    lineWidth: 1,
    priceLineVisible: false,
    lastValueVisible: false,
  });
  handles.emas[index] = line;
  return { line, created: true };
}

function since<T extends { time: number }, R>(rows: T[], from: number, map: (row: T) => R): R[] {
  return rows.filter((row) => row.time >= from).map(map);
}

export function applyFeed(handles: FeedChart, data: IntradayTfData): void {
  const last = data.candles.at(-1);
  if (!last) return;
  const from = handles.lastTime !== null && last.time >= handles.lastTime ? handles.lastTime : null;
  const write = <T extends { time: number }, R>(
    series: { setData(rows: R[]): void; update(row: R): void },
    rows: T[],
    map: (row: T) => R,
    full = false,
  ) => {
    if (from === null || full) {
      series.setData(rows.map(map));
      return;
    }
    for (const row of since(rows, from, map)) series.update(row);
  };

  write(handles.candle, data.candles, toCandle);
  write(handles.volume, data.volumes, (row) => toBar(row, theme.textSecondary));
  write(handles.hist, data.macdHist, (row) => toBar(row, row.value >= 0 ? theme.up : theme.down));
  write(handles.dif, data.macdDif, toPoint);
  write(handles.dea, data.macdDea, toPoint);
  for (const [index, ema] of data.emas.entries()) {
    const { line, created } = emaLine(handles, index);
    write(line, ema.data, toPoint, created);
  }
  handles.session.setData(data.offSession ?? []);
  if (from === null) handles.chart.timeScale().fitContent();
  handles.lastTime = last.time;
}
