import type { RawBar } from "../../../../shared/types.js";
import { buildDayIndicators, buildWeekIndicators } from "../generate/indicatorsFixture.js";
import type { EpisodeState } from "./engine.js";
import type { Question, RunnerQuestion } from "../schema/question.js";

const MARKET_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function numberOf(value: string | number): number {
  return typeof value === "number" ? value : Number(value);
}

function marketDate(time: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(time)) return time;
  const parts = MARKET_DATE_FORMATTER.formatToParts(new Date(time));
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function weekKey(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  const day = value.getUTCDay();
  const delta = day === 0 ? -6 : 1 - day;
  value.setUTCDate(value.getUTCDate() + delta);
  return value.toISOString().slice(0, 10);
}

function aggregate(key: string, bars: RawBar[]): RawBar {
  return {
    time: key,
    open: numberOf(bars[0].open),
    high: Math.max(...bars.map((bar) => numberOf(bar.high))),
    low: Math.min(...bars.map((bar) => numberOf(bar.low))),
    close: numberOf(bars.at(-1)!.close),
    volume: bars.reduce((sum, bar) => sum + numberOf(bar.volume), 0),
  };
}

function groupBars(bars: RawBar[], keyOf: (bar: RawBar) => string): RawBar[] {
  const groups = new Map<string, RawBar[]>();
  for (const bar of bars) {
    const key = keyOf(bar);
    const group = groups.get(key);
    if (group) group.push(bar);
    else groups.set(key, [bar]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, group]) => aggregate(key, group));
}

function mergeByTime(base: RawBar[], updates: RawBar[]): RawBar[] {
  const merged = new Map(base.map((bar) => [bar.time.slice(0, 10), bar]));
  for (const bar of updates) merged.set(bar.time.slice(0, 10), bar);
  return [...merged.values()].sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
}

function visibleRollups(question: Question, period: "day" | "week", asOf: string): RawBar[] {
  const asOfMs = Date.parse(asOf);
  return (question.replay.rollups?.[period] ?? [])
    .filter((item) => Date.parse(item.availableAt) <= asOfMs)
    .map((item) => item.bar);
}

function dayView(question: Question, revealed: RawBar[], asOf: string): RawBar[] {
  const initial = question.fixtures.kline.day ?? [];
  if (question.replay.basePeriod !== "1h") return [...initial, ...revealed];
  const updates = groupBars(revealed, (bar) => marketDate(bar.time));
  return mergeByTime(mergeByTime(initial, updates), visibleRollups(question, "day", asOf));
}

function weekView(question: Question, days: RawBar[], asOf: string): RawBar[] {
  const initial = question.fixtures.kline.week ?? [];
  const updates = groupBars(days, (bar) => weekKey(marketDate(bar.time)));
  return mergeByTime(mergeByTime(initial, updates), visibleRollups(question, "week", asOf));
}

function quoteView(question: Question, days: RawBar[], revealed: RawBar[]): Record<string, unknown> {
  const current = revealed.at(-1) ?? days.at(-1);
  if (!current) return question.fixtures.quote;
  const currentDay = marketDate(current.time);
  const currentDayBar = [...days].reverse().find((bar) => marketDate(bar.time) === currentDay) ?? current;
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

export function buildEpisodeQuestionViewAtCursor(question: Question, cursor: number): RunnerQuestion {
  const revealed = cursor >= 0 ? question.replay.bars.slice(0, cursor + 1) : [];
  const cutoff = revealed.at(-1)?.time ?? question.cutoff;
  const days = dayView(question, revealed, cutoff);
  const weeks = weekView(question, days, cutoff);
  const oneHour = question.replay.basePeriod === "1h"
    ? [...(question.fixtures.kline["1h"] ?? []), ...revealed]
    : question.fixtures.kline["1h"];
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
        ...(oneHour ? { "1h": oneHour } : {}),
        day: days,
        week: weeks,
      },
      indicators: {
        ...question.fixtures.indicators,
        day: buildDayIndicators(days),
        week: buildWeekIndicators(weeks),
      },
      quote: quoteView(question, days, revealed),
    },
  };
}

export function buildEpisodeQuestionView(question: Question, state: EpisodeState): RunnerQuestion {
  return buildEpisodeQuestionViewAtCursor(question, state.cursor);
}
