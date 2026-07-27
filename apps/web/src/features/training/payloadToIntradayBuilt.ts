import type { TrainerClosedTrade, TrainerView, TrainerViewPeriod } from '@kansoku/pro-api';
import { lineData, macd, toTs } from '@kansoku/core/analysis/indicators';
import type {
  Candle,
  ColoredPoint,
  IntradayBuilt,
  IntradaySidebar,
  IntradayTfData,
  IntradayTfSummary,
  RawBar,
  SeriesMarker,
} from '@kansoku/shared/types';
import { fmt } from '@web/lib/format';
import { theme } from '@web/lib/theme';
import type { ChartTf } from '../charts/intraday/timeframes';
import { formatPositionSize } from './orderDraft';
import { tradeEntryFills, tradeExitFills } from './settlementStats';

export const TRAINER_PERIOD_TO_CHART_TF: Record<TrainerViewPeriod, ChartTf> = {
  '1m': '1m',
  '5m': 'm5',
  '15m': 'm15',
  '30m': '30m',
  '1h': 'h1',
  'day': 'day',
  'week': 'week',
};

export type TrainerLadder = TrainerView['ladder'];

export function isTrainerLadderTf(ladder: TrainerLadder, tf: ChartTf): boolean {
  return ladder.some((period) => TRAINER_PERIOD_TO_CHART_TF[period] === tf);
}

export function trainerAdvancePeriod(ladder: TrainerLadder, tf: ChartTf): TrainerViewPeriod {
  return ladder.find((period) => TRAINER_PERIOD_TO_CHART_TF[period] === tf) ?? ladder[0];
}

const EXIT_MARK_LABEL: Record<TrainerClosedTrade['exitReason'], string> = {
  stop: '止损',
  target: '止盈',
  manual: '手动平',
  horizon: '到期平',
};

const EXIT_MARK_COLOR: Record<TrainerClosedTrade['exitReason'], string> = {
  stop: theme.down,
  target: theme.up,
  manual: theme.textSecondary,
  horizon: theme.textSecondary,
};

// A trade executes on the base period, so its timestamp is a bar time only on the base tier. On the
// aggregated tiers it falls inside a bucket, and lightweight-charts drops a marker whose time is not
// a data point — hence the snap back to the bar that contains it.
function snapToBar(timesTs: readonly number[], at: number): number | null {
  if (timesTs.length === 0) return null;
  let snapped: number | null = null;
  for (const t of timesTs) {
    if (t > at) break;
    snapped = t;
  }
  return snapped ?? timesTs[0];
}

// The exit mark sits on the side the price actually went, so it lands next to the bar's low on a
// stopped-out long instead of floating above it where it reads as a level rather than an event.
// Only a round trip that closed at its entry price falls back to the side opposite the entry,
// which keeps a same-bar open-and-close from stacking both marks in one place.
function exitSide(trade: TrainerClosedTrade, price: number): SeriesMarker['position'] {
  if (price < trade.entry.price) return 'belowBar';
  if (price > trade.entry.price) return 'aboveBar';
  return trade.direction === 'long' ? 'aboveBar' : 'belowBar';
}

// Every fill gets its own mark. The trade-level `entry` / `exit` are size-weighted averages: on a
// scaled trade they name a price that was never traded, and drawing them would put the whole add
// and the whole partial take-profit off the chart while the settlement table below lists them.
function tradeMarkers(trades: readonly TrainerClosedTrade[], timesTs: number[]): SeriesMarker[] {
  const markers: SeriesMarker[] = [];
  for (const trade of trades) {
    const long = trade.direction === 'long';
    const label = `第 ${trade.tradeId} 笔 · ${long ? '多' : '空'}`;
    const entries = tradeEntryFills(trade);
    const exits = tradeExitFills(trade);
    const share = (size: number, total: number) =>
      total > 1 ? ` ${formatPositionSize(size)}` : '';
    entries.forEach((fill, index) => {
      const at = snapToBar(timesTs, toTs(fill.time));
      if (at === null) return;
      const action = index === 0 ? '进' : '加';
      markers.push({
        id: `trade-${trade.tradeId}-entry-${index}`,
        time: at,
        position: long ? 'belowBar' : 'aboveBar',
        color: theme.accent,
        shape: long ? 'arrowUp' : 'arrowDown',
        text: `${action} ${fmt(fill.price)}${share(fill.size, entries.length)}`,
        tooltip: `${label}\n${index === 0 ? '进场' : '加仓'} $${fmt(fill.price)} · ${formatPositionSize(fill.size)}\n止损 $${fmt(trade.initialStop)} · 目标 $${fmt(trade.target)}${trade.entryReason ? `\n${trade.entryReason.summary}` : ''}`,
      });
    });
    exits.forEach((fill, index) => {
      const at = snapToBar(timesTs, toTs(fill.time));
      if (at === null) return;
      const net =
        index === exits.length - 1
          ? `\n净 ${fmt(trade.netR)} R · 持有 ${trade.holdingBars} 根`
          : '';
      markers.push({
        id: `trade-${trade.tradeId}-exit-${index}`,
        time: at,
        position: exitSide(trade, fill.price),
        color: EXIT_MARK_COLOR[fill.reason],
        shape: long ? 'arrowDown' : 'arrowUp',
        text: `离场 ${fmt(fill.price)}${share(fill.size, exits.length)} · ${EXIT_MARK_LABEL[fill.reason]}`,
        tooltip: `${label}\n离场 $${fmt(fill.price)} · ${formatPositionSize(fill.size)}（${EXIT_MARK_LABEL[fill.reason]}）${net}`,
      });
    });
  }
  return markers;
}

function rawBarsToTfData(bars: RawBar[], trades: readonly TrainerClosedTrade[]): IntradayTfData {
  const timesTs = bars.map((b) => toTs(b.time));
  const closes = bars.map((b) => Number(b.close));
  const candles: Candle[] = bars.map((b, i) => ({
    time: timesTs[i],
    open: Number(b.open),
    high: Number(b.high),
    low: Number(b.low),
    close: closes[i],
  }));
  const volumes: ColoredPoint[] = bars.map((b, i) => ({
    time: timesTs[i],
    value: Number(b.volume),
  }));
  const { dif, dea, hist } = macd(closes);
  const macdHist: ColoredPoint[] = [];
  for (let i = 0; i < timesTs.length; i++) {
    const h = hist[i];
    if (h === null) continue;
    macdHist.push({ time: timesTs[i], value: h, color: h >= 0 ? '#26a69a' : '#ef5350' });
  }
  return {
    candles,
    volumes,
    emas: [],
    macdDif: lineData(timesTs, dif),
    macdDea: lineData(timesTs, dea),
    macdHist,
    macdCrossMarkers: [],
    markers: tradeMarkers(trades, timesTs),
    priceConnectors: [],
    macdConnectors: [],
    autoDivergence: [],
    autoBeichi: [],
  };
}

function emptyTfSummary(): IntradayTfSummary {
  return {
    last_dif: null,
    last_dea: null,
    last_hist: null,
    emas: [],
    recent_swing_highs: [],
    recent_swing_lows: [],
    last_cross: null,
    divergence_candidates: [],
    beichi_candidates: [],
  };
}

function buildSidebar(view: TrainerView): IntradaySidebar {
  const lastBar = view.bars.base.at(-1);
  return {
    symbol: view.symbol,
    name: view.symbol,
    asOf: view.asOf,
    last: lastBar ? Number(lastBar.close) : 0,
    prediction: null,
    entryPlan: null,
    position: null,
    technicals: { m5: emptyTfSummary(), m15: emptyTfSummary(), h1: emptyTfSummary() },
    dayContext: null,
    optionsLevels: null,
    eventRisk: null,
    news: [],
    context: null,
  };
}

export function buildTrainerIntradayBuilt(
  view: TrainerView,
  epilogueBars?: RawBar[] | null,
): IntradayBuilt {
  // The epilogue is stored at the case's base period, so it only ever extends the base tier —
  // it is not re-aggregated into the mid/top tiers.
  const base = epilogueBars?.length ? [...view.bars.base, ...epilogueBars] : view.bars.base;
  const tierBars: readonly RawBar[][] = [base, view.bars.mid, view.bars.top];
  // Closed trades are marked only once the episode is over: mid-episode they would put a target
  // price on the chart the trader is still deciding against.
  const trades = view.terminal ? view.trades : [];
  const timeframes: Record<string, IntradayTfData> = {};
  view.ladder.forEach((period, i) => {
    timeframes[TRAINER_PERIOD_TO_CHART_TF[period]] = rawBarsToTfData(tierBars[i], trades);
  });
  return {
    kind: 'intraday',
    defaultTf: 'm5',
    timeframes: timeframes as IntradayBuilt['timeframes'],
    entryPlan: null,
    sidebar: buildSidebar(view),
  };
}
