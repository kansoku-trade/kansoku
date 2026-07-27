import type { TrainerView, TrainerViewPeriod } from '@kansoku/pro-api';
import { lineData, macd, toTs } from '@kansoku/core/analysis/indicators';
import type {
  Candle,
  ColoredPoint,
  IntradayBuilt,
  IntradaySidebar,
  IntradayTfData,
  IntradayTfSummary,
  RawBar,
} from '@kansoku/shared/types';
import type { ChartTf } from '../charts/intraday/timeframes';

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

function rawBarsToTfData(bars: RawBar[]): IntradayTfData {
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
    markers: [],
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
  const timeframes: Record<string, IntradayTfData> = {};
  view.ladder.forEach((period, i) => {
    timeframes[TRAINER_PERIOD_TO_CHART_TF[period]] = rawBarsToTfData(tierBars[i]);
  });
  return {
    kind: 'intraday',
    defaultTf: 'm5',
    timeframes: timeframes as IntradayBuilt['timeframes'],
    entryPlan: null,
    sidebar: buildSidebar(view),
  };
}
