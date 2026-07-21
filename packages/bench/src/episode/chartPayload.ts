import type { RawBar } from '@kansoku/shared/types';
import type { Question } from '../schema/question.js';
import { buildEpisodeQuestionViewAtCursor } from './view.js';
import { fmt, fmtSigned } from './labels.js';
import { closedTrades, tradeExitLabel, type ReportRow } from './rows.js';
import type { ChartTimeframe } from './process.js';

export type { ChartTimeframe } from './process.js';

export const CHART_TIMEFRAME_ORDER: ChartTimeframe[] = ['h1', 'day', 'week'];
export const CHART_TIMEFRAME_KLINE_KEY: Record<ChartTimeframe, '1h' | 'day' | 'week'> = {
  h1: '1h',
  day: 'day',
  week: 'week',
};
export const CHART_TIMEFRAME_LABEL: Record<ChartTimeframe, string> = {
  h1: '1 小时',
  day: '日线',
  week: '周线',
};

export function availableTimeframesFor(question: Question | null | undefined): ChartTimeframe[] {
  if (!question) return [];
  const kl = question.fixtures.kline as Record<string, unknown[] | undefined>;
  return CHART_TIMEFRAME_ORDER.filter((tf) => {
    const bars = kl[CHART_TIMEFRAME_KLINE_KEY[tf]];
    return Array.isArray(bars) && bars.length > 0;
  });
}

export interface ChartBar {
  time: number | string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChartMarker {
  time: number | string;
  position: 'aboveBar' | 'belowBar';
  color: string;
  shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square';
  text: string;
}

export interface ChartTradeTimes {
  decision: number | string | null;
  entry: number | string | null;
  exit: number | string | null;
}

export interface ChartTradeRef {
  tradeId: number;
  entry: number;
  stop: number;
  target: number;
  times: Record<ChartTimeframe, ChartTradeTimes>;
}

export interface ChartPayload {
  id: string;
  symbol: string;
  finalBarIndex: number;
  baseRanges: Record<ChartTimeframe, ChartBar[]>;
  replayH1: ChartBar[];
  snapshotPatches: Record<string, { day: ChartBar[]; week: ChartBar[] }>;
  markers: Record<ChartTimeframe, ChartMarker[]>;
  levels: Array<{ title: string; price: number; color: string }>;
  trades: ChartTradeRef[];
  availableTimeframes: ChartTimeframe[];
  defaultTimeframe: ChartTimeframe;
}

function finite(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const MARKET_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function marketDate(time: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(time)) return time;
  const parts = MARKET_DATE_FORMATTER.formatToParts(new Date(time));
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function weekKey(time: string): string {
  const date = marketDate(time);
  const value = new Date(`${date}T00:00:00Z`);
  const day = value.getUTCDay();
  value.setUTCDate(value.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return value.toISOString().slice(0, 10);
}

export function chartTime(time: string, timeframe: ChartTimeframe): number | string {
  return timeframe === 'h1'
    ? Math.floor(Date.parse(time) / 1_000)
    : timeframe === 'day'
      ? marketDate(time)
      : weekKey(time);
}

function toChartBar(bar: RawBar, timeframe: ChartTimeframe): ChartBar | null {
  const open = finite(bar.open);
  const high = finite(bar.high);
  const low = finite(bar.low);
  const close = finite(bar.close);
  const volume = finite(bar.volume);
  const time = chartTime(bar.time, timeframe);
  if (open == null || high == null || low == null || close == null || volume == null) return null;
  if (typeof time === 'number' && !Number.isFinite(time)) return null;
  return { time, open, high, low, close, volume };
}

function toChartBars(bars: RawBar[], timeframe: ChartTimeframe): ChartBar[] {
  const deduped = new Map<string, ChartBar>();
  for (const bar of bars) {
    const converted = toChartBar(bar, timeframe);
    if (converted) deduped.set(String(converted.time), converted);
  }
  return [...deduped.values()].sort((a, b) => {
    if (typeof a.time === 'number' && typeof b.time === 'number') return a.time - b.time;
    return String(a.time).localeCompare(String(b.time));
  });
}

function visibleCursor(row: ReportRow): number {
  if (!row.question) return -1;
  const times = new Set(
    (row.answer.result?.actions ?? [])
      .map((action) => action.effectiveBarTime)
      .filter((time): time is string => time != null),
  );
  let cursor = -1;
  row.question.replay.bars.forEach((bar, index) => {
    if (times.has(bar.time)) cursor = index;
  });
  return cursor;
}

function rangesAtBarIndex(question: Question, barIndex: number): Record<ChartTimeframe, ChartBar[]> {
  const clamped = Math.max(0, Math.min(question.replay.bars.length, Math.floor(barIndex)));
  const view = buildEpisodeQuestionViewAtCursor(question, clamped - 1);
  return {
    h1: toChartBars(view.fixtures.kline['1h'] ?? [], 'h1'),
    day: toChartBars(view.fixtures.kline.day ?? [], 'day'),
    week: toChartBars(view.fixtures.kline.week ?? [], 'week'),
  };
}

export function finalVisibleBarIndex(row: ReportRow): number {
  if (!row.question) return 0;
  if (
    row.answer.status === 'completed' &&
    (row.answer.result?.terminationReason === 'horizon' ||
      row.answer.result?.terminationReason === 'no_trade')
  ) {
    return row.question.replay.bars.length;
  }
  const fromActions = visibleCursor(row) + 1;
  const fromTrace = row.processEvents.reduce(
    (maximum, event) => Math.max(maximum, event.snapshotBar),
    0,
  );
  return Math.max(0, Math.min(row.question.replay.bars.length, Math.max(fromActions, fromTrace)));
}

function changedChartBars(previous: ChartBar[], current: ChartBar[]): ChartBar[] {
  const prior = new Map(previous.map((bar) => [String(bar.time), bar]));
  return current.filter((bar) => {
    const before = prior.get(String(bar.time));
    return (
      !before ||
      before.open !== bar.open ||
      before.high !== bar.high ||
      before.low !== bar.low ||
      before.close !== bar.close ||
      before.volume !== bar.volume
    );
  });
}

export function buildChartPayload(row: ReportRow, index: number): ChartPayload | null {
  if (!row.question) return null;
  const finalBarIndex = finalVisibleBarIndex(row);
  const baseRanges = rangesAtBarIndex(row.question, 0);
  const finalRanges = rangesAtBarIndex(row.question, finalBarIndex);
  const replayH1 = finalRanges.h1.slice(baseRanges.h1.length);
  const snapshotPatches: ChartPayload['snapshotPatches'] = {};
  let previousRanges = baseRanges;
  for (let barIndex = 1; barIndex <= finalBarIndex; barIndex += 1) {
    const currentRanges = rangesAtBarIndex(row.question, barIndex);
    snapshotPatches[String(barIndex)] = {
      day: changedChartBars(previousRanges.day, currentRanges.day),
      week: changedChartBars(previousRanges.week, currentRanges.week),
    };
    previousRanges = currentRanges;
  }
  const trades = closedTrades(row.answer);
  const markers = { h1: [], day: [], week: [] } as Record<ChartTimeframe, ChartMarker[]>;
  const availableTf = availableTimeframesFor(row.question);
  const firstReplay = row.question.replay.bars[0];
  const finalReplay = row.question.replay.bars.at(finalBarIndex - 1);
  for (const tf of availableTf) {
    const key = CHART_TIMEFRAME_KLINE_KEY[tf];
    const bars = row.question.fixtures.kline[key] ?? [];
    const caseStartBar = bars.at(-1);
    if (caseStartBar) {
      markers[tf].push({
        time: chartTime(caseStartBar.time, tf),
        position: 'belowBar',
        color: '#171717',
        shape: 'square',
        text: 'CASE START · B0',
      });
    }
    if (firstReplay && finalBarIndex >= 1) {
      markers[tf].push({
        time: chartTime(firstReplay.time, tf),
        position: 'belowBar',
        color: '#737373',
        shape: 'circle',
        text: 'B1 · 首根回放',
      });
    }
    if (finalReplay && finalBarIndex === row.question.replay.bars.length) {
      markers[tf].push({
        time: chartTime(finalReplay.time, tf),
        position: 'aboveBar',
        color: '#171717',
        shape: 'square',
        text: `B${finalBarIndex} · 强制结算`,
      });
    }
    for (const trade of trades) {
      const decisionSourceForTrade =
        trade.decisionBar === 0 ? caseStartBar : row.question.replay.bars[trade.decisionBar - 1];
      if (decisionSourceForTrade && trade.decisionBar <= finalBarIndex) {
        markers[tf].push({
          time: chartTime(decisionSourceForTrade.time, tf),
          position: trade.direction === 'short' ? 'aboveBar' : 'belowBar',
          color: '#7c3aed',
          shape: trade.direction === 'short' ? 'arrowDown' : 'arrowUp',
          text: `T${trade.tradeId} 决策 B${trade.decisionBar}`,
        });
      }
    }
  }
  for (const timeframe of ['h1', 'day', 'week'] as const) {
    const available = new Set(finalRanges[timeframe].map((bar) => String(bar.time)));
    for (const trade of trades) {
      const entryTime = chartTime(trade.entry.time, timeframe);
      if (available.has(String(entryTime))) {
        markers[timeframe].push({
          time: entryTime,
          position: trade.direction === 'short' ? 'aboveBar' : 'belowBar',
          color: '#e8e8e8',
          shape: trade.direction === 'short' ? 'arrowDown' : 'arrowUp',
          text: `T${trade.tradeId} 成交 ${fmt(trade.entry.price)} · S ${fmt(trade.initialStop)} · T ${fmt(trade.target)}`,
        });
      }
      const exitTime = chartTime(trade.exit.time, timeframe);
      const exitLabel = tradeExitLabel(trade);
      if (available.has(String(exitTime))) {
        markers[timeframe].push({
          time: exitTime,
          position: trade.direction === 'short' ? 'belowBar' : 'aboveBar',
          color: trade.netR >= 0 ? '#26a69a' : '#ef5350',
          shape: 'circle',
          text: `T${trade.tradeId} ${exitLabel} ${fmt(trade.exit.price)} · ${fmtSigned(trade.netR, 2)}R`,
        });
      }
    }
    markers[timeframe].sort((a, b) => String(a.time).localeCompare(String(b.time)));
  }
  const plan = row.answer.initialSubmission?.entry_plan;
  const levels: ChartPayload['levels'] = [];
  if (plan?.entry != null) levels.push({ title: '计划入场', price: plan.entry, color: '#e8e8e8' });
  if (plan?.stop != null) levels.push({ title: '止损', price: plan.stop, color: '#ef5350' });
  if (plan?.target1 != null) levels.push({ title: '止盈', price: plan.target1, color: '#26a69a' });
  const chartTrades: ChartTradeRef[] = trades.map((trade) => {
    const times = {} as Record<ChartTimeframe, ChartTradeTimes>;
    for (const tf of CHART_TIMEFRAME_ORDER) {
      const key = CHART_TIMEFRAME_KLINE_KEY[tf];
      const startBar = (row.question?.fixtures.kline[key] ?? []).at(-1);
      const decisionSource =
        trade.decisionBar === 0 ? startBar : row.question?.replay.bars[trade.decisionBar - 1];
      times[tf] = {
        decision: decisionSource ? chartTime(decisionSource.time, tf) : null,
        entry: chartTime(trade.entry.time, tf),
        exit: chartTime(trade.exit.time, tf),
      };
    }
    return {
      tradeId: trade.tradeId,
      entry: trade.entry.price,
      stop: trade.finalStop,
      target: trade.target,
      times,
    };
  });
  const availableTimeframes = availableTimeframesFor(row.question);
  const defaultTimeframe = availableTimeframes[0] ?? 'day';
  return {
    id: `trade-chart-${index}`,
    symbol: row.answer.symbol,
    finalBarIndex,
    baseRanges,
    replayH1,
    snapshotPatches,
    markers,
    levels,
    trades: chartTrades,
    availableTimeframes,
    defaultTimeframe,
  };
}
