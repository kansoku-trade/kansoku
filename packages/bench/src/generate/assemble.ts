import type { RawBar } from "../../../shared/types.js";
import type { Question } from "../schema/question.js";
import { buildDayIndicators, buildWeekIndicators } from "./indicatorsFixture.js";
import { buildQuestionId } from "./id.js";
import { lastCompletedWeekIndex } from "./windowing.js";

export interface QuoteBar extends RawBar {
  turnover?: string;
}

export interface AssembleQuestionInput {
  symbol: string;
  layer: string;
  dayBars: QuoteBar[];
  weekBars: QuoteBar[];
  cutoffIndex: number;
  seq: number;
  requiredBeforeDay: number;
  requiredBeforeWeek: number;
  horizonBars: number;
  calendar: Record<string, unknown>;
}

function stripToRawBar(bar: QuoteBar): RawBar {
  return { time: bar.time, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume };
}

export function assembleQuestion(input: AssembleQuestionInput): Question {
  const {
    symbol,
    layer,
    dayBars,
    weekBars,
    cutoffIndex,
    seq,
    requiredBeforeDay,
    requiredBeforeWeek,
    horizonBars,
    calendar,
  } = input;

  const cutoffBar = dayBars[cutoffIndex];
  const cutoffDate = cutoffBar.time.slice(0, 10);
  const cutoffIso = `${cutoffDate}T20:00:00-04:00`;
  const prevBar = dayBars[cutoffIndex - 1];

  const dayWindow = dayBars.slice(cutoffIndex - requiredBeforeDay + 1, cutoffIndex + 1);
  const replayBars = dayBars.slice(cutoffIndex + 1, cutoffIndex + 1 + horizonBars);

  const weekCutoffIndex = lastCompletedWeekIndex(weekBars, cutoffDate);
  const weekWindow = weekBars.slice(Math.max(0, weekCutoffIndex - requiredBeforeWeek + 1), weekCutoffIndex + 1);

  const quote = {
    last: Number(cutoffBar.close),
    open: Number(cutoffBar.open),
    high: Number(cutoffBar.high),
    low: Number(cutoffBar.low),
    volume: Number(cutoffBar.volume),
    turnover: cutoffBar.turnover !== undefined ? Number(cutoffBar.turnover) : null,
    prev_close: prevBar ? Number(prevBar.close) : null,
  };

  return {
    id: buildQuestionId(symbol, cutoffDate, seq),
    bank: "swing",
    symbol,
    cutoff: cutoffIso,
    layer,
    adversarial: false,
    fixtures: {
      kline: {
        day: dayWindow.map(stripToRawBar),
        week: weekWindow.map(stripToRawBar),
      },
      indicators: {
        day: buildDayIndicators(dayWindow),
        week: buildWeekIndicators(weekWindow),
      },
      quote,
      capitalFlow: {},
      news: [],
      fundamentals: {},
      calendar,
    },
    replay: {
      horizonBars,
      bars: replayBars.map(stripToRawBar),
    },
  };
}
