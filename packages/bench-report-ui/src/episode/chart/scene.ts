import type {
  EpisodeReportChartPayload,
  EpisodeReportChartTimeframe,
  EpisodeReportChartTradeRef,
} from '../../types';
import { chartTheme } from '../../styles/chartTheme';
import { computeEma20 } from './ema';
import { rangesForBar } from './ranges';

export interface TradeSelection {
  kind: 'trade';
  tradeId: number;
  trade: EpisodeReportChartTradeRef;
}

export interface ActionSelection {
  kind: 'action';
  step: number;
  times: Record<EpisodeReportChartTimeframe, number | string>;
}

export type ChartSelection = TradeSelection | ActionSelection | null;

export interface ScenePoint {
  time: number | string;
}

export interface SceneCandle extends ScenePoint {
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface SceneVolume extends ScenePoint {
  value: number;
  color: string;
}

export interface SceneLine extends ScenePoint {
  value: number;
}

export interface ScenePriceLine {
  price: number;
  color: string;
  title: string;
  dashed: boolean;
}

export interface ChartScene {
  candles: SceneCandle[];
  volume: SceneVolume[];
  ema: SceneLine[] | null;
  silentMarkers: Array<{
    time: number | string;
    position: 'aboveBar' | 'belowBar';
    color: string;
    shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square';
    text: '';
  }>;
  tooltips: Map<string, string[]>;
  priceLines: ScenePriceLine[];
  splitTime: number | string | null;
  highlightTime: number | string | null;
  visibleRange: { from: number; to: number };
  rangeText: string;
}

const TIMEFRAME_LABEL: Record<EpisodeReportChartTimeframe, string> = {
  h1: '1 小时',
  day: '日线',
  week: '周线',
};

const DEFAULT_VISIBLE_BARS: Record<EpisodeReportChartTimeframe, number> = {
  h1: 90,
  day: 120,
  week: 104,
};

function fmt(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : '—';
}

function tradePriceLines(trade: EpisodeReportChartTradeRef): ScenePriceLine[] {
  return [
    {
      price: trade.entry,
      color: chartTheme.textPrimary,
      title: `T${trade.tradeId} 成交`,
      dashed: false,
    },
    { price: trade.stop, color: chartTheme.down, title: `T${trade.tradeId} 止损`, dashed: false },
    {
      price: trade.target,
      color: chartTheme.up,
      title: `T${trade.tradeId} 止盈`,
      dashed: false,
    },
  ];
}

export function buildChartScene(
  payload: EpisodeReportChartPayload,
  timeframe: EpisodeReportChartTimeframe,
  barIndex: number,
  selection: ChartSelection,
): ChartScene {
  const ranges = rangesForBar(payload, barIndex);
  const bars = ranges[timeframe] ?? [];
  const candles: SceneCandle[] = bars.map((bar) => ({
    time: bar.time,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
  }));
  const volume: SceneVolume[] = bars.map((bar) => ({
    time: bar.time,
    value: bar.volume,
    color: bar.close >= bar.open ? 'rgba(38,166,154,.45)' : 'rgba(239,83,80,.42)',
  }));

  const emaPoints = computeEma20(bars.map((bar) => bar.close));
  const ema =
    emaPoints.length > 0
      ? emaPoints.map((point) => ({ time: bars[point.index].time, value: point.value }))
      : null;

  const historicBars = payload.baseRanges[timeframe] ?? [];
  const splitTime = historicBars.length ? historicBars[historicBars.length - 1].time : null;

  const availableTimes = new Set(bars.map((bar) => String(bar.time)));
  const markers = (payload.markers[timeframe] ?? []).filter((marker) =>
    availableTimes.has(String(marker.time)),
  );
  const tooltips = new Map<string, string[]>();
  for (const marker of markers) {
    const key = String(marker.time);
    const arr = tooltips.get(key) ?? [];
    if (marker.text) arr.push(marker.text);
    tooltips.set(key, arr);
  }
  const silentMarkers = markers.map((marker) => ({
    time: marker.time,
    position: marker.position,
    color: marker.color,
    shape: marker.shape,
    text: '' as const,
  }));

  let priceLines: ScenePriceLine[];
  let highlightTime: number | string | null = null;
  if (selection?.kind === 'trade') {
    priceLines = tradePriceLines(selection.trade);
    highlightTime = selection.trade.times[timeframe]?.decision ?? null;
  } else {
    priceLines = payload.levels.map((level) => ({
      price: level.price,
      color: level.color,
      title: level.title,
      dashed: true,
    }));
    if (selection?.kind === 'action') {
      highlightTime = selection.times[timeframe] ?? null;
    }
  }

  const defaultBars = DEFAULT_VISIBLE_BARS[timeframe];
  let visibleRange = {
    from: Math.max(-0.5, candles.length - defaultBars - 0.5),
    to: candles.length + 6,
  };
  if (highlightTime != null) {
    const index = candles.findIndex((candle) => String(candle.time) === String(highlightTime));
    if (index >= 0) {
      visibleRange = { from: index - 45, to: index + 45 };
    }
  }

  const scope = barIndex === payload.finalBarIndex ? '终局' : '历史快照';
  const rangeText = `${TIMEFRAME_LABEL[timeframe]} · ${candles.length} bars · ${scope} B${barIndex}`;

  return {
    candles,
    volume,
    ema,
    silentMarkers,
    tooltips,
    priceLines,
    splitTime,
    highlightTime,
    visibleRange,
    rangeText,
  };
}

export { fmt as formatPrice };