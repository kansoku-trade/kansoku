import type { TrainerClosedTrade, TrainerReviewPayload } from '@kansoku/pro-api';
import type { IntradayBuilt, IntradayTfData, RawBar } from '@kansoku/shared/types';
import type { ChartTf } from '../charts/intraday/timeframes';
import type { ReplayBand } from '../charts/intraday/replayBandPrimitive';
import {
  emptyTfSummary,
  rawBarsToTfData,
  TRAINER_PERIOD_TO_CHART_TF,
} from './payloadToIntradayBuilt';

const sec = (iso: string): number => Math.floor(Date.parse(iso) / 1000);

export function reviewChartTf(payload: TrainerReviewPayload): ChartTf {
  return TRAINER_PERIOD_TO_CHART_TF[payload.basePeriod];
}

/** The last playable bar, where the brush rests until the trader drags it. */
export function reviewMaxBrush(payload: TrainerReviewPayload): number {
  return Math.max(0, payload.replay.length - 1);
}

function atEnd(payload: TrainerReviewPayload, brush: number): boolean {
  return brush >= reviewMaxBrush(payload);
}

/**
 * Bars up to the brush, and no further. Dragging it left is the whole point of the page: the chart
 * has to come back to what was on screen at that bar, which means the bars after it stop existing
 * rather than merely dimming.
 *
 * The epilogue only joins when the brush is parked at the end. Splicing it onto a rewound chart
 * would put post-case prices immediately after a mid-case bar.
 */
export function reviewSeries(
  payload: TrainerReviewPayload,
  brush: number,
  showEpilogue: boolean,
): RawBar[] {
  const played = payload.replay.slice(0, Math.max(0, brush) + 1);
  const tail = showEpilogue && atEnd(payload, brush) ? payload.epilogue : [];
  return [...payload.lookback, ...played, ...tail];
}

/**
 * A trade the trader had not made yet at the brush position is not drawn. Rewinding the chart and
 * leaving the marks on would show them an entry they had not taken, which is the one thing this
 * page exists to reconstruct honestly.
 */
export function reviewTrades(
  payload: TrainerReviewPayload,
  brush: number,
): TrainerClosedTrade[] {
  const cutoff = payload.replay[Math.max(0, brush)];
  if (!cutoff) return [];
  const cutoffMs = Date.parse(cutoff.time);
  return payload.trades.filter((trade) => Date.parse(trade.entry.time) <= cutoffMs);
}

/**
 * Three visibility classes plus the epilogue: what the case handed over, what the trader stepped
 * through, and the stretch they never reached because they closed out first.
 */
export function reviewBands(
  payload: TrainerReviewPayload,
  brush: number,
  showEpilogue: boolean,
): ReplayBand[] {
  const bands: ReplayBand[] = [];
  const lastGiven = payload.lookback.at(-1);
  // Left-unbounded rather than anchored to the first bar: everything before the cutoff was equally
  // handed over, including history older than the array happens to carry.
  if (lastGiven) bands.push({ kind: 'given', startTime: 0, endTime: sec(lastGiven.time) });

  const shown = Math.min(Math.max(0, brush), reviewMaxBrush(payload));
  const playedTo = Math.min(shown, payload.playedThrough);
  if (payload.replay.length > 0 && playedTo >= 0) {
    bands.push({
      kind: 'played',
      startTime: sec(payload.replay[0].time),
      endTime: sec(payload.replay[playedTo].time),
    });
  }
  if (shown > payload.playedThrough) {
    bands.push({
      kind: 'fog',
      startTime: sec(payload.replay[payload.playedThrough + 1].time),
      endTime: sec(payload.replay[shown].time),
    });
  }
  if (showEpilogue && atEnd(payload, brush) && payload.epilogue.length > 0) {
    bands.push({
      kind: 'epilogue',
      startTime: sec(payload.epilogue[0].time),
      endTime: sec(payload.epilogue.at(-1)!.time),
    });
  }
  return bands;
}

export function buildReviewBuilt(
  payload: TrainerReviewPayload,
  brush: number,
  showEpilogue: boolean,
): IntradayBuilt {
  const tf = reviewChartTf(payload);
  const bars = reviewSeries(payload, brush, showEpilogue);
  const timeframes: Record<string, IntradayTfData> = {
    [tf]: rawBarsToTfData(bars, reviewTrades(payload, brush), null),
  };
  return {
    kind: 'intraday',
    // `defaultTf` is only consulted when no `activeTf` is passed, and the review chart always
    // passes one — the base period, which may be a tier this union does not name.
    defaultTf: 'm5',
    timeframes: timeframes as IntradayBuilt['timeframes'],
    entryPlan: null,
    sidebar: {
      symbol: payload.symbol,
      name: payload.symbol,
      asOf: bars.at(-1)?.time ?? '',
      last: Number(bars.at(-1)?.close ?? 0),
      prediction: null,
      entryPlan: null,
      position: null,
      technicals: { m5: emptyTfSummary(), m15: emptyTfSummary(), h1: emptyTfSummary() },
      dayContext: null,
      optionsLevels: null,
      eventRisk: null,
      news: [],
      context: null,
    },
  };
}
