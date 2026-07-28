import type {
  TrainerClosedTrade,
  TrainerDirection,
  TrainerPosition,
  TrainerView,
  TrainerViewPeriod,
} from '@kansoku/pro-api';
import { lineData, macd, sma, toTs } from '@kansoku/core/analysis/indicators';
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
import { extendTierWithEpilogue } from './epilogueTiers';
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

// Kept in lockstep with coerceIntradayTimeframe in @kansoku/core: the trainer must read exactly
// like a live symbol chart, or it drills a habit that misfires on the real thing.
const VOLUME_SURGE_COLOR = '#ff5722';

// One letter per fill. The old labels spelled out price, side and reason, which put a 90px string
// on top of the candles at the exact bar the trader wants to look at. The letter says what happened
// to the position, the arrow colour says how it ended, and the tooltip still carries price, size
// and R for anyone who hovers.
const ENTRY_MARK: Record<TrainerDirection, string> = { long: 'B', short: 'S' };

const EXIT_MARK: Record<TrainerClosedTrade['exitReason'], string> = {
  stop: 'X',
  target: 'T',
  manual: 'C',
  horizon: 'E',
};

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
  for (let i = 0; i < timesTs.length; i++) {
    if (timesTs[i] > at) break;
    snapped = i;
  }
  return snapped ?? 0;
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

// lightweight-charts resets its marker stack on every new bar, so two labels drawn at the same
// height overprint each other. A one-character label is about a bar wide, so it only has to clear
// its immediate neighbour — the old rule scaled the gap with the bar count, which made sense for a
// 90px string and would now blank letters that had plenty of room.
const MIN_LABEL_GAP_BARS = 2;

function thinLabels(placed: { index: number; marker: SeriesMarker }[]): void {
  const minGap = MIN_LABEL_GAP_BARS;
  const lastLabelled = new Map<SeriesMarker['position'], number>();
  for (const { index, marker } of placed) {
    if (!marker.text) continue;
    const previous = lastLabelled.get(marker.position);
    if (previous !== undefined && index - previous < minGap) marker.text = '';
    else lastLabelled.set(marker.position, index);
  }
}

type PlacedMarker = { index: number; marker: SeriesMarker };

// The position the trader is still holding gets the same arrows as a finished one — without them
// the chart says nothing about where they actually got in, which is the one thing they need while
// deciding what to do next. No label carries an outcome, because there is not one yet.
function positionMarkers(position: TrainerPosition, timesTs: number[]): PlacedMarker[] {
  const placed: PlacedMarker[] = [];
  const long = position.direction === 'long';
  const label = `第 ${position.tradeId} 笔 · ${long ? '多' : '空'} · 持仓中`;
  position.lots.forEach((fill, index) => {
    const at = snapToBar(timesTs, toTs(fill.time));
    if (at === null) return;
    placed.push({
      index: at,
      marker: {
        id: `open-${position.tradeId}-entry-${index}`,
        time: timesTs[at],
        position: long ? 'belowBar' : 'aboveBar',
        color: theme.accent,
        shape: long ? 'arrowUp' : 'arrowDown',
        text: ENTRY_MARK[position.direction],
        tooltip: `${label}\n${index === 0 ? '进场' : '加仓'} $${fmt(fill.price)} · ${formatPositionSize(fill.size)}\n止损 $${fmt(position.stop)} · 目标 $${fmt(position.target)}`,
      },
    });
  });
  position.exits.forEach((fill, index) => {
    const at = snapToBar(timesTs, toTs(fill.time));
    if (at === null) return;
    placed.push({
      index: at,
      marker: {
        id: `open-${position.tradeId}-exit-${index}`,
        time: timesTs[at],
        position: fill.price < position.entryPrice ? 'belowBar' : 'aboveBar',
        color: EXIT_MARK_COLOR[fill.reason],
        shape: long ? 'arrowDown' : 'arrowUp',
        text: EXIT_MARK[fill.reason],
        tooltip: `${label}\n减仓 $${fmt(fill.price)} · ${formatPositionSize(fill.size)}（${EXIT_MARK_LABEL[fill.reason]}）`,
      },
    });
  });
  return placed;
}

// Every fill gets its own arrow and its own letter. The trade-level `entry` / `exit` are
// size-weighted averages: on a scaled trade they name a price that was never traded, and drawing
// them would put the whole add and the whole partial take-profit off the chart while the settlement
// table below lists them.
function tradeMarkers(trades: readonly TrainerClosedTrade[], timesTs: number[]): PlacedMarker[] {
  const placed: PlacedMarker[] = [];
  for (const trade of trades) {
    const long = trade.direction === 'long';
    const label = `第 ${trade.tradeId} 笔 · ${long ? '多' : '空'}`;
    const entries = tradeEntryFills(trade);
    const exits = tradeExitFills(trade);
    entries.forEach((fill, index) => {
      const at = snapToBar(timesTs, toTs(fill.time));
      if (at === null) return;
      placed.push({
        index: at,
        marker: {
          id: `trade-${trade.tradeId}-entry-${index}`,
          time: timesTs[at],
          position: long ? 'belowBar' : 'aboveBar',
          color: theme.accent,
          shape: long ? 'arrowUp' : 'arrowDown',
          text: ENTRY_MARK[trade.direction],
          tooltip: `${label}\n${index === 0 ? '进场' : '加仓'} $${fmt(fill.price)} · ${formatPositionSize(fill.size)}\n止损 $${fmt(trade.initialStop)} · 目标 $${fmt(trade.target)}${trade.entryReason ? `\n${trade.entryReason.summary}` : ''}`,
        },
      });
    });
    exits.forEach((fill, index) => {
      const at = snapToBar(timesTs, toTs(fill.time));
      if (at === null) return;
      const last = index === exits.length - 1;
      const net = last ? `\n净 ${fmt(trade.netR)} R · 持有 ${trade.holdingBars} 根` : '';
      placed.push({
        index: at,
        marker: {
          id: `trade-${trade.tradeId}-exit-${index}`,
          time: timesTs[at],
          position: exitSide(trade, fill.price),
          color: EXIT_MARK_COLOR[fill.reason],
          shape: long ? 'arrowDown' : 'arrowUp',
          text: EXIT_MARK[fill.reason],
          tooltip: `${label}\n离场 $${fmt(fill.price)} · ${formatPositionSize(fill.size)}（${EXIT_MARK_LABEL[fill.reason]}）${net}`,
        },
      });
    });
  }
  return placed;
}

function episodeMarkers(
  trades: readonly TrainerClosedTrade[],
  position: TrainerPosition | null,
  timesTs: number[],
): SeriesMarker[] {
  const placed = [
    ...tradeMarkers(trades, timesTs),
    ...(position ? positionMarkers(position, timesTs) : []),
  ];
  placed.sort((a, b) => a.index - b.index);
  thinLabels(placed);
  return placed.map((entry) => entry.marker);
}

function rawBarsToTfData(
  bars: RawBar[],
  trades: readonly TrainerClosedTrade[],
  position: TrainerPosition | null,
): IntradayTfData {
  const timesTs = bars.map((b) => toTs(b.time));
  const closes = bars.map((b) => Number(b.close));
  const candles: Candle[] = bars.map((b, i) => ({
    time: timesTs[i],
    open: Number(b.open),
    high: Number(b.high),
    low: Number(b.low),
    close: closes[i],
  }));
  const vols = bars.map((b) => Number(b.volume));
  const vol20 = sma(vols, 20);
  const volumes: ColoredPoint[] = bars.map((b, i) => {
    const v20 = vol20[i];
    const surge = v20 !== null && vols[i] >= 1.5 * v20;
    return {
      time: timesTs[i],
      value: vols[i],
      color: surge ? VOLUME_SURGE_COLOR : closes[i] >= Number(b.open) ? theme.up : theme.down,
    };
  });
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
    markers: episodeMarkers(trades, position, timesTs),
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
  // The epilogue is stored at the case's base period: the base tier takes it as-is, the two
  // aggregated tiers have to roll it into their own buckets first.
  const epilogue = epilogueBars ?? [];
  const tierBars: readonly RawBar[][] = [
    epilogue.length ? [...view.bars.base, ...epilogue] : view.bars.base,
    extendTierWithEpilogue(view.ladder[1], view.bars.mid, epilogue),
    extendTierWithEpilogue(view.ladder[2], view.bars.top, epilogue),
  ];
  // Every fill the trader has made in this episode is marked, open position included. These are
  // their own past actions on already-revealed bars, so nothing here is post-cursor: leaving them
  // off left the chart silent about where they got in, which is exactly what they need to see while
  // deciding what to do next.
  const trades = view.trades;
  const position = view.terminal ? null : view.position;
  const timeframes: Record<string, IntradayTfData> = {};
  view.ladder.forEach((period, i) => {
    timeframes[TRAINER_PERIOD_TO_CHART_TF[period]] = rawBarsToTfData(tierBars[i], trades, position);
  });
  return {
    kind: 'intraday',
    defaultTf: 'm5',
    timeframes: timeframes as IntradayBuilt['timeframes'],
    entryPlan: null,
    sidebar: buildSidebar(view),
  };
}
