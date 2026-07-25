import type { RawBar } from '@kansoku/shared/types';
import { buildDayIndicators, buildWeekIndicators } from '../generate/indicatorsFixture.js';
import type { EpisodeState } from './engine.js';
import { periodBucketKey, type EpisodeViewPeriod } from './periods.js';
import {
  questionBaseBars,
  questionBarsForPeriod,
  questionLadder,
  questionRollupsForPeriod,
} from './questionLadder.js';
import type { Question, RunnerQuestion } from '../schema/question.js';

const MARKET_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function numberOf(value: string | number): number {
  return typeof value === 'number' ? value : Number(value);
}

function marketDate(time: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(time)) return time;
  const parts = MARKET_DATE_FORMATTER.formatToParts(new Date(time));
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function bucketOpenTime(period: EpisodeViewPeriod, bars: RawBar[]): string {
  return period === 'day' || period === 'week'
    ? periodBucketKey(period, bars[0].time)
    : bars[0].time;
}

function aggregate(time: string, bars: RawBar[]): RawBar {
  return {
    time,
    open: numberOf(bars[0].open),
    high: Math.max(...bars.map((bar) => numberOf(bar.high))),
    low: Math.min(...bars.map((bar) => numberOf(bar.low))),
    close: numberOf(bars.at(-1)!.close),
    volume: bars.reduce((sum, bar) => sum + numberOf(bar.volume), 0),
  };
}

function groupBars(period: EpisodeViewPeriod, bars: RawBar[]): RawBar[] {
  const groups = new Map<string, RawBar[]>();
  for (const bar of bars) {
    const key = periodBucketKey(period, bar.time);
    const group = groups.get(key);
    if (group) group.push(bar);
    else groups.set(key, [bar]);
  }
  return [...groups.values()]
    .map((group) => aggregate(bucketOpenTime(period, group), group))
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
}

function mergeByTime(period: EpisodeViewPeriod, base: RawBar[], updates: RawBar[]): RawBar[] {
  const merged = new Map(base.map((bar) => [periodBucketKey(period, bar.time), bar]));
  for (const bar of updates) merged.set(periodBucketKey(period, bar.time), bar);
  return [...merged.values()].sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
}

function visibleRollups(question: Question, period: EpisodeViewPeriod, asOf: string): RawBar[] {
  const asOfMs = Date.parse(asOf);
  return questionRollupsForPeriod(question, period)
    .filter((item) => Date.parse(item.availableAt) <= asOfMs)
    .map((item) => item.bar);
}

function tierBars(
  question: Question,
  period: EpisodeViewPeriod,
  sourceBars: RawBar[],
  asOf: string,
): RawBar[] {
  const initial = questionBarsForPeriod(question, period);
  const updates = groupBars(period, sourceBars);
  return mergeByTime(
    period,
    mergeByTime(period, initial, updates),
    visibleRollups(question, period, asOf),
  );
}

function quoteView(
  question: Question,
  days: RawBar[],
  revealed: RawBar[],
): Record<string, unknown> {
  const current = revealed.at(-1) ?? days.at(-1);
  if (!current) return question.fixtures.quote;
  const currentDay = marketDate(current.time);
  const currentDayBar =
    [...days].reverse().find((bar) => marketDate(bar.time) === currentDay) ?? current;
  const previousDay = [...days].reverse().find((bar) => marketDate(bar.time) < currentDay);
  return {
    last: numberOf(currentDayBar.close),
    open: numberOf(currentDayBar.open),
    high: numberOf(currentDayBar.high),
    low: numberOf(currentDayBar.low),
    volume: numberOf(currentDayBar.volume),
    prev_close: previousDay ? numberOf(previousDay.close) : null,
  };
}

export function buildEpisodeQuestionViewAtCursor(
  question: Question,
  cursor: number,
): RunnerQuestion {
  const revealed = cursor >= 0 ? question.replay.bars.slice(0, cursor + 1) : [];
  const cutoff = revealed.at(-1)?.time ?? question.cutoff;
  const [basePeriod, midPeriod, topPeriod] = questionLadder(question);
  const baseBars = [...questionBaseBars(question), ...revealed];
  const midBars = tierBars(question, midPeriod, revealed, cutoff);
  const topBars = tierBars(question, topPeriod, midBars, cutoff);
  const quoteDayBars = tierBars(question, 'day', revealed, cutoff);
  return {
    id: question.id,
    bank: question.bank,
    symbol: question.symbol,
    cutoff,
    layer: question.layer,
    adversarial: question.adversarial,
    fixtures: {
      ...question.fixtures,
      kline: {
        ...question.fixtures.kline,
        ...(baseBars.length ? { [basePeriod]: baseBars } : {}),
        [midPeriod]: midBars,
        [topPeriod]: topBars,
      },
      indicators: {
        ...question.fixtures.indicators,
        [midPeriod]: buildDayIndicators(midBars),
        [topPeriod]: buildWeekIndicators(topBars),
      },
      quote: quoteView(question, quoteDayBars, revealed),
    },
  };
}

export function buildEpisodeQuestionView(question: Question, state: EpisodeState): RunnerQuestion {
  return buildEpisodeQuestionViewAtCursor(question, state.cursor);
}
