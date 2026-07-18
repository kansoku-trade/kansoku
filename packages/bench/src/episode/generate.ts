import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { RawBar } from "../../../shared/types.js";
import { buildDayIndicators, buildWeekIndicators } from "../generate/indicatorsFixture.js";
import { buildQuestionId } from "../generate/id.js";
import type { QuoteBar } from "../generate/assemble.js";
import type { CalendarEvent, EpisodeKlinePeriod } from "../generate/source.js";
import type { Question } from "../schema/question.js";
import { Value } from "typebox/value";
import { questionSchema } from "../schema/question.js";

export const EPISODE_REQUIRED_H1 = 210;
export const EPISODE_REQUIRED_DAY = 250;
export const EPISODE_REQUIRED_WEEK = 104;
export const EPISODE_DEFAULT_HORIZON_SESSIONS = 40;
export const EPISODE_ENTRY_EXPIRY_SESSIONS = 3;

const ET_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const ET_OFFSET_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  timeZoneName: "longOffset",
});

function numberOf(value: string | number | undefined): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function marketDate(time: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(time)) return time;
  const parts = ET_DATE_FORMATTER.formatToParts(new Date(time));
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function weekKey(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  const day = value.getUTCDay();
  value.setUTCDate(value.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return value.toISOString().slice(0, 10);
}

export function marketCloseIso(date: string): string {
  const noonUtc = new Date(`${date}T12:00:00Z`);
  const zone = ET_OFFSET_FORMATTER.formatToParts(noonUtc).find((part) => part.type === "timeZoneName")?.value;
  const offset = zone?.replace("GMT", "") ?? "-05:00";
  return `${date}T16:00:00${offset}`;
}

function strip(bar: QuoteBar): RawBar {
  return { time: bar.time, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume };
}

function aggregateWeek(key: string, bars: QuoteBar[]): QuoteBar {
  const numeric = (value: string | number): number => {
    const parsed = numberOf(value);
    if (parsed == null) throw new Error(`invalid numeric bar value: ${value}`);
    return parsed;
  };
  return {
    time: key,
    open: numeric(bars[0].open),
    high: Math.max(...bars.map((bar) => numeric(bar.high))),
    low: Math.min(...bars.map((bar) => numeric(bar.low))),
    close: numeric(bars.at(-1)!.close),
    volume: bars.reduce((sum, bar) => sum + numeric(bar.volume), 0),
  };
}

function takeSessionsAfter(bars: QuoteBar[], cutoffMs: number, sessions: number): QuoteBar[] {
  const selected: QuoteBar[] = [];
  const dates = new Set<string>();
  for (const bar of bars) {
    if (Date.parse(bar.time) >= cutoffMs) {
      const date = marketDate(bar.time);
      if (!dates.has(date) && dates.size >= sessions) break;
      dates.add(date);
      selected.push(bar);
    }
  }
  return selected;
}

function barsInFirstSessions(bars: QuoteBar[], sessions: number): number {
  const dates = new Set<string>();
  let count = 0;
  for (const bar of bars) {
    const date = marketDate(bar.time);
    if (!dates.has(date) && dates.size >= sessions) break;
    dates.add(date);
    count += 1;
  }
  return count;
}

function buildReplayRollups(dayBars: QuoteBar[], weekBars: QuoteBar[], replay: QuoteBar[]) {
  const replayByDate = new Map<string, QuoteBar[]>();
  for (const bar of replay) {
    const date = marketDate(bar.time);
    const group = replayByDate.get(date);
    if (group) group.push(bar);
    else replayByDate.set(date, [bar]);
  }

  const dayByDate = new Map(dayBars.map((bar) => [marketDate(bar.time), bar]));
  const day = [...replayByDate.entries()].flatMap(([date, hours]) => {
    const nativeBar = dayByDate.get(date);
    const availableAt = hours.at(-1)?.time;
    return nativeBar && availableAt ? [{ availableAt, bar: strip(nativeBar) }] : [];
  });

  const allDaysByWeek = new Map<string, QuoteBar[]>();
  for (const bar of dayBars) {
    const key = weekKey(marketDate(bar.time));
    const group = allDaysByWeek.get(key);
    if (group) group.push(bar);
    else allDaysByWeek.set(key, [bar]);
  }
  const weekByKey = new Map(weekBars.map((bar) => [weekKey(marketDate(bar.time)), bar]));
  const replayWeeks = new Set([...replayByDate.keys()].map(weekKey));
  const week = [...replayWeeks].flatMap((key) => {
    const sourceDays = allDaysByWeek.get(key) ?? [];
    const lastSessionDate = sourceDays.map((bar) => marketDate(bar.time)).sort().at(-1);
    const nativeBar = weekByKey.get(key);
    const availableAt = lastSessionDate ? replayByDate.get(lastSessionDate)?.at(-1)?.time : undefined;
    return nativeBar && availableAt ? [{ availableAt, bar: strip(nativeBar) }] : [];
  });

  return {
    day: day.sort((a, b) => Date.parse(a.availableAt) - Date.parse(b.availableAt)),
    week: week.sort((a, b) => Date.parse(a.availableAt) - Date.parse(b.availableAt)),
  };
}

export interface AssembleEpisodeQuestionInput {
  symbol: string;
  layer: string;
  cutoffDate: string;
  dayBars: QuoteBar[];
  weekBars: QuoteBar[];
  hourBars: QuoteBar[];
  horizonSessions?: number;
  calendar?: Record<string, unknown>;
}

export function assembleEpisodeQuestion(input: AssembleEpisodeQuestionInput): Question {
  const horizonSessions = input.horizonSessions ?? EPISODE_DEFAULT_HORIZON_SESSIONS;
  const cutoff = marketCloseIso(input.cutoffDate);
  const cutoffMs = Date.parse(cutoff);
  const initialHours = input.hourBars.filter((bar) => Date.parse(bar.time) < cutoffMs).slice(-EPISODE_REQUIRED_H1);
  const initialDays = input.dayBars.filter((bar) => marketDate(bar.time) <= input.cutoffDate).slice(-EPISODE_REQUIRED_DAY);
  const cutoffWeek = weekKey(input.cutoffDate);
  const completedWeeks = input.weekBars.filter((bar) => weekKey(marketDate(bar.time)) < cutoffWeek);
  const currentWeekDays = initialDays.filter((bar) => weekKey(marketDate(bar.time)) === cutoffWeek);
  const partialWeek = currentWeekDays.length > 0 ? aggregateWeek(cutoffWeek, currentWeekDays) : null;
  const initialWeeks = [...completedWeeks, ...(partialWeek ? [partialWeek] : [])].slice(-EPISODE_REQUIRED_WEEK);
  const replay = takeSessionsAfter(input.hourBars, cutoffMs, horizonSessions);

  if (initialHours.length < EPISODE_REQUIRED_H1) {
    throw new Error(`insufficient 1h history: need ${EPISODE_REQUIRED_H1}, got ${initialHours.length}`);
  }
  if (initialDays.length < EPISODE_REQUIRED_DAY) {
    throw new Error(`insufficient day history: need ${EPISODE_REQUIRED_DAY}, got ${initialDays.length}`);
  }
  if (initialWeeks.length < EPISODE_REQUIRED_WEEK) {
    throw new Error(`insufficient week history: need ${EPISODE_REQUIRED_WEEK}, got ${initialWeeks.length}`);
  }
  const replaySessions = new Set(replay.map((bar) => marketDate(bar.time))).size;
  if (replaySessions < horizonSessions) {
    throw new Error(`insufficient replay sessions: need ${horizonSessions}, got ${replaySessions}`);
  }

  const cutoffDay = initialDays.at(-1)!;
  const previousDay = initialDays.at(-2);
  const question: Question = {
    id: buildQuestionId(input.symbol, input.cutoffDate, 1),
    bank: "swing",
    symbol: input.symbol,
    cutoff,
    layer: input.layer,
    adversarial: false,
    fixtures: {
      kline: {
        "1h": initialHours.map(strip),
        day: initialDays.map(strip),
        week: initialWeeks.map(strip),
      },
      indicators: {
        day: buildDayIndicators(initialDays),
        week: buildWeekIndicators(initialWeeks),
      },
      quote: {
        last: numberOf(cutoffDay.close),
        open: numberOf(cutoffDay.open),
        high: numberOf(cutoffDay.high),
        low: numberOf(cutoffDay.low),
        volume: numberOf(cutoffDay.volume),
        turnover: numberOf(cutoffDay.turnover),
        prev_close: numberOf(previousDay?.close),
      },
      capitalFlow: {},
      news: [],
      fundamentals: {},
      calendar: input.calendar ?? {},
    },
    replay: {
      basePeriod: "1h",
      entryExpiryBars: barsInFirstSessions(replay, EPISODE_ENTRY_EXPIRY_SESSIONS),
      horizonSessions,
      horizonBars: replay.length,
      bars: replay.map(strip),
      rollups: buildReplayRollups(input.dayBars, input.weekBars, replay),
    },
  };

  if (!Value.Check(questionSchema, question)) {
    const first = Value.Errors(questionSchema, question)[0];
    throw new Error(`invalid episode question: ${first?.instancePath ?? "(root)"} ${first?.message ?? "schema mismatch"}`);
  }
  return question;
}

export type FetchEpisodeKlineHistory = (
  symbol: string,
  period: EpisodeKlinePeriod,
  start: string,
  end: string,
) => Promise<QuoteBar[]>;

export interface GenerateEpisodeCaseOptions {
  symbol: string;
  layer: string;
  cutoffDate: string;
  version: string;
  horizonSessions?: number;
  datasetsRoot: string;
  fetchKlineHistory: FetchEpisodeKlineHistory;
  fetchCalendar?: (symbol: string, start: string, end: string) => Promise<CalendarEvent[]>;
  log?: (line: string) => void;
}

function addDays(date: string, count: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}

export async function generateEpisodeCase(options: GenerateEpisodeCaseOptions) {
  const log = options.log ?? (() => {});
  const sessions = options.horizonSessions ?? EPISODE_DEFAULT_HORIZON_SESSIONS;
  const hourStart = addDays(options.cutoffDate, -90);
  const rangeEnd = addDays(options.cutoffDate, Math.ceil(sessions * 2.5) + 14);
  log(`${options.symbol}: fetching 1h ${hourStart}..${rangeEnd}, day/week history through ${rangeEnd}`);

  const [hourBars, dayBars, weekBars, calendarEvents] = await Promise.all([
    options.fetchKlineHistory(options.symbol, "1h", hourStart, rangeEnd),
    options.fetchKlineHistory(options.symbol, "day", "2022-01-01", rangeEnd),
    options.fetchKlineHistory(options.symbol, "week", "2022-01-01", rangeEnd),
    options.fetchCalendar
      ? options.fetchCalendar(options.symbol, options.cutoffDate, addDays(options.cutoffDate, 180)).catch(() => [])
      : Promise.resolve([]),
  ]);

  const question = assembleEpisodeQuestion({
    symbol: options.symbol,
    layer: options.layer,
    cutoffDate: options.cutoffDate,
    hourBars,
    dayBars,
    weekBars,
    horizonSessions: sessions,
    calendar: { events: calendarEvents },
  });
  const dir = join(options.datasetsRoot, options.version, "swing");
  const file = join(dir, `${question.id}.json`);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(question, null, 2)}\n`, "utf8");
  log(
    `${question.id}: ${question.fixtures.kline["1h"].length} initial 1h, ` +
      `${question.fixtures.kline.day.length} day, ${question.fixtures.kline.week.length} week, ` +
      `${question.replay.horizonBars} replay 1h across ${question.replay.horizonSessions} sessions`,
  );
  return { question, file };
}
