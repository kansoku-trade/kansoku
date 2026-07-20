import {
  type CandlePatternStatus,
  type EntryPlanStatus,
  type MarkerPosition,
  type MarkerShape,
  type TimeframeKey,
} from '@kansoku/shared/types';
import { formatMarketMonthDayTime } from '@kansoku/shared/time';

export const TIMEFRAME_ORDER: TimeframeKey[] = ['m5', 'm15', 'h1'];
export const TIMEFRAME_LABELS: Record<TimeframeKey, string> = {
  m5: '5分钟',
  m15: '15分钟',
  h1: '1小时',
};
export const DEFAULT_EMA_PERIODS = [9, 21, 55];
export const MACD_MIN_BARS = 60;
export const SIGNAL_ICON: Record<string, string> = {
  pin_bar: '📌',
  macd_divergence: '⚡',
  macd_beichi: '🌀',
};
export const BEICHI_WEAKER_RATIO = 0.9;
export const MIN_PUSH_BARS = 3;
export const ZONE_COLORS: Record<string, string> = {
  entry: '#58a6ff',
  stop: '#ef5350',
  target: '#26a69a',
  support: '#26a69a',
  resistance: '#ffb74d',
  invalidation: '#ef5350',
  watch: '#8b949e',
};
export const BIAS_MARKER_STYLE: Record<
  'bullish' | 'bearish' | 'neutral',
  { position: MarkerPosition; color: string; shape: MarkerShape }
> = {
  bullish: { position: 'belowBar', color: '#26a69a', shape: 'arrowUp' },
  bearish: { position: 'aboveBar', color: '#ef5350', shape: 'arrowDown' },
  neutral: { position: 'inBar', color: '#9e9e9e', shape: 'circle' },
};
export const SIGNAL_BIAS_STYLE: Record<
  'bullish' | 'bearish' | 'neutral',
  { color: string; shape: MarkerShape }
> = {
  bullish: { color: '#26a69a', shape: 'arrowUp' },
  bearish: { color: '#ef5350', shape: 'arrowDown' },
  neutral: { color: '#ffc107', shape: 'circle' },
};
export const ANCHOR_DIRECTION_STYLE: Record<
  'long' | 'short' | 'neutral',
  { label: string; shape: MarkerShape; position: MarkerPosition }
> = {
  long: { label: '做多', shape: 'arrowUp', position: 'belowBar' },
  short: { label: '做空', shape: 'arrowDown', position: 'aboveBar' },
  neutral: { label: '观望', shape: 'circle', position: 'inBar' },
};
export const PATTERN_STATUS_TEXT: Record<CandlePatternStatus, string> = {
  pending: '待确认',
  confirmed: '✓已确认',
  invalidated: '✗已失效',
  expired: '已过期（3根内未触发确认或失效）',
};
export const PATTERN_LABEL_SUFFIX: Partial<Record<CandlePatternStatus, string>> = {
  pending: '?',
  confirmed: '✓',
};
export const ENTRY_STATUS_NOTES: Record<Exclude<EntryPlanStatus, 'waiting'>, string> = {
  triggered: '已触发入场，止损/目标价位生效',
  invalidated: '未触发入场，价格已朝止损方向走破入场-止损中线——计划失效，需重估',
  stopped: '入场后触及止损，计划已了结',
};

export const barTimeShort = (t: number) => formatMarketMonthDayTime(t, true);

export const VWAP_TIMEFRAMES = new Set<string>(['m5', 'm15']);

export const MARKER_GROUP_RANK: Record<string, number> = {
  ai: 0,
  divergence: 1,
  beichi: 2,
  pattern123: 3,
  candle: 4,
};
export const MAX_MARKERS_PER_BAR = 2;
export const AI_AUTO_MERGE_BAR_WINDOW = 2;

export const AI_ICON_TO_AUTO_GROUP: Record<string, 'divergence' | 'beichi'> = {
  [SIGNAL_ICON.macd_divergence]: 'divergence',
  [SIGNAL_ICON.macd_beichi]: 'beichi',
};

export const CONTEXT_STANCES = new Set(['long', 'short', 'neutral']);
