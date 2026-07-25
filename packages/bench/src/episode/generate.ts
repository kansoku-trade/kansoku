import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { RawBar } from '@kansoku/shared/types';
import { buildDayIndicators, buildWeekIndicators } from '../generate/indicatorsFixture.js';
import { buildQuestionId } from '../generate/id.js';
import type { QuoteBar } from '../generate/assemble.js';
import type { CalendarEvent, EpisodeKlinePeriod } from '../generate/source.js';
import type { Question, ReplayRollupEntry } from '../schema/question.js';
import { Value } from 'typebox/value';
import { questionSchema } from '../schema/question.js';
import {
  episodePeriodLadder,
  periodBucketStart,
  EPISODE_INTRADAY_MINUTES,
  type EpisodeBasePeriod,
  type EpisodeViewPeriod,
} from './periods.js';

export const EPISODE_REQUIRED_BASE = 210;
export const EPISODE_REQUIRED_MID = 250;
export const EPISODE_REQUIRED_TOP = 104;
export const EPISODE_REQUIRED_H1 = EPISODE_REQUIRED_BASE;
export const EPISODE_REQUIRED_DAY = EPISODE_REQUIRED_MID;
export const EPISODE_REQUIRED_WEEK = EPISODE_REQUIRED_TOP;
export const EPISODE_DEFAULT_HORIZON_SESSIONS = 40;
export const EPISODE_ENTRY_EXPIRY_SESSIONS = 3;

const REGULAR_SESSION_MINUTES = 390;

const ET_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const ET_OFFSET_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  timeZoneName: 'longOffset',
});

function numberOf(value: string | number | undefined): number | null {
  if (value == null) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function marketDate(time: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(time)) return time;
  const parts = ET_DATE_FORMATTER.formatToParts(new Date(time));
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function weekKey(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  const day = value.getUTCDay();
  value.setUTCDate(value.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return value.toISOString().slice(0, 10);
}

export function marketCloseIso(date: string): string {
  const noonUtc = new Date(`${date}T12:00:00Z`);
  const zone = ET_OFFSET_FORMATTER.formatToParts(noonUtc).find(
    (part) => part.type === 'timeZoneName',
  )?.value;
  const offset = zone?.replace('GMT', '') ?? '-05:00';
  return `${date}T16:00:00${offset}`;
}

function strip(bar: QuoteBar): RawBar {
  return {
    time: bar.time,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
  };
}

function aggregateBucket(time: string, bars: QuoteBar[]): QuoteBar {
  const numeric = (value: string | number): number => {
    const parsed = numberOf(value);
    if (parsed == null) throw new Error(`invalid numeric bar value: ${value}`);
    return parsed;
  };
  const hasTurnover = bars.every((bar) => bar.turnover !== undefined);
  return {
    time,
    open: numeric(bars[0].open),
    high: Math.max(...bars.map((bar) => numeric(bar.high))),
    low: Math.min(...bars.map((bar) => numeric(bar.low))),
    close: numeric(bars.at(-1)!.close),
    volume: bars.reduce((sum, bar) => sum + numeric(bar.volume), 0),
    ...(hasTurnover
      ? { turnover: String(bars.reduce((sum, bar) => sum + numeric(bar.turnover!), 0)) }
      : {}),
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

function takeBarsAfter(bars: QuoteBar[], cutoffMs: number, count: number): QuoteBar[] {
  const selected: QuoteBar[] = [];
  for (const bar of bars) {
    if (Date.parse(bar.time) >= cutoffMs) {
      selected.push(bar);
      if (selected.length >= count) break;
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

function barsPerSession(basePeriod: EpisodeBasePeriod): number {
  return Math.ceil(REGULAR_SESSION_MINUTES / EPISODE_INTRADAY_MINUTES[basePeriod]);
}

export function requiredBaseBars(basePeriod: EpisodeBasePeriod): number {
  return Math.max(EPISODE_REQUIRED_BASE, 2 * barsPerSession(basePeriod));
}

function nativeDayInitial(nativeBars: QuoteBar[], cutoffDate: string, required: number): QuoteBar[] {
  return nativeBars.filter((bar) => marketDate(bar.time) <= cutoffDate).slice(-required);
}

function foldInitialTier(
  period: EpisodeViewPeriod,
  nativeBars: QuoteBar[],
  lowerBars: QuoteBar[],
  cutoffIso: string,
  required: number,
): QuoteBar[] {
  const cutoffBucketStart = periodBucketStart(period, cutoffIso);
  const cutoffBucketStartMs = Date.parse(cutoffBucketStart);
  const completed = nativeBars.filter(
    (bar) => Date.parse(periodBucketStart(period, bar.time)) < cutoffBucketStartMs,
  );
  const currentLower = lowerBars.filter(
    (bar) => periodBucketStart(period, bar.time) === cutoffBucketStart,
  );
  const partial = currentLower.length > 0 ? aggregateBucket(cutoffBucketStart, currentLower) : null;
  return [...completed, ...(partial ? [partial] : [])].slice(-required);
}

function deriveDayBarsFromBase(bars: QuoteBar[]): QuoteBar[] {
  const groups = new Map<string, QuoteBar[]>();
  for (const bar of bars) {
    const date = marketDate(bar.time);
    const group = groups.get(date);
    if (group) group.push(bar);
    else groups.set(date, [bar]);
  }
  return [...groups.entries()]
    .map(([date, groupBars]) => aggregateBucket(date, groupBars))
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
}

function groupByBucketStart(period: EpisodeViewPeriod, bars: QuoteBar[]): Map<string, QuoteBar[]> {
  const groups = new Map<string, QuoteBar[]>();
  for (const bar of bars) {
    const key = periodBucketStart(period, bar.time);
    const group = groups.get(key);
    if (group) group.push(bar);
    else groups.set(key, [bar]);
  }
  return groups;
}

function buildReplayRollups(
  midPeriod: EpisodeViewPeriod,
  topPeriod: EpisodeViewPeriod,
  midSource: QuoteBar[],
  topSource: QuoteBar[],
  baseSource: QuoteBar[],
  replay: QuoteBar[],
  requireCompleteMidBucket: boolean,
): Record<string, ReplayRollupEntry[]> {
  const replayByMidBucket = groupByBucketStart(midPeriod, replay);
  const midByBucket = new Map(midSource.map((bar) => [periodBucketStart(midPeriod, bar.time), bar]));
  const topByBucket = new Map(topSource.map((bar) => [periodBucketStart(topPeriod, bar.time), bar]));
  const midFullByTopBucket = groupByBucketStart(topPeriod, midSource);

  const baseByMidBucket = requireCompleteMidBucket ? groupByBucketStart(midPeriod, baseSource) : null;
  const completeMidBuckets = baseByMidBucket
    ? new Set(
        [...replayByMidBucket.entries()]
          .filter(([key, bars]) => bars.length === (baseByMidBucket.get(key)?.length ?? -1))
          .map(([key]) => key),
      )
    : new Set(replayByMidBucket.keys());

  const mid: ReplayRollupEntry[] = [...completeMidBuckets].flatMap((key) => {
    const nativeBar = midByBucket.get(key);
    const availableAt = replayByMidBucket.get(key)?.at(-1)?.time;
    return nativeBar && availableAt ? [{ availableAt, bar: strip(nativeBar) }] : [];
  });

  const replayTopBuckets = new Set(
    [...replayByMidBucket.keys()].map((midBucketStart) => periodBucketStart(topPeriod, midBucketStart)),
  );
  const top: ReplayRollupEntry[] = [...replayTopBuckets].flatMap((topKey) => {
    const sourceMidBars = midFullByTopBucket.get(topKey) ?? [];
    const lastMidBucketStart = sourceMidBars
      .map((bar) => periodBucketStart(midPeriod, bar.time))
      .sort((a, b) => Date.parse(a) - Date.parse(b))
      .at(-1);
    const nativeBar = topByBucket.get(topKey);
    const availableAt =
      lastMidBucketStart && completeMidBuckets.has(lastMidBucketStart)
        ? replayByMidBucket.get(lastMidBucketStart)?.at(-1)?.time
        : undefined;
    return nativeBar && availableAt ? [{ availableAt, bar: strip(nativeBar) }] : [];
  });

  return {
    [midPeriod]: mid.sort((a, b) => Date.parse(a.availableAt) - Date.parse(b.availableAt)),
    [topPeriod]: top.sort((a, b) => Date.parse(a.availableAt) - Date.parse(b.availableAt)),
  };
}

export interface AssembleEpisodeQuestionInput {
  symbol: string;
  layer: string;
  cutoffDate: string;
  basePeriod?: EpisodeBasePeriod;
  baseBars?: QuoteBar[];
  midBars?: QuoteBar[];
  topBars?: QuoteBar[];
  hourBars?: QuoteBar[];
  dayBars?: QuoteBar[];
  weekBars?: QuoteBar[];
  horizonSessions?: number;
  horizonBars?: number;
  calendar?: Record<string, unknown>;
}

export function assembleEpisodeQuestion(input: AssembleEpisodeQuestionInput): Question {
  const basePeriod = input.basePeriod ?? '1h';
  const [ladderBase, ladderMid, ladderTop] = episodePeriodLadder(basePeriod);

  const baseSource = input.baseBars ?? input.hourBars ?? [];
  const midSource = input.midBars ?? input.dayBars ?? [];
  const topSource = input.topBars ?? input.weekBars ?? [];

  const cutoff = marketCloseIso(input.cutoffDate);
  const cutoffMs = Date.parse(cutoff);
  const requiredBase = requiredBaseBars(basePeriod);

  const initialBase = baseSource
    .filter((bar) => Date.parse(bar.time) < cutoffMs)
    .slice(-requiredBase);

  const initialMid =
    ladderMid === 'day'
      ? nativeDayInitial(midSource, input.cutoffDate, EPISODE_REQUIRED_MID)
      : foldInitialTier(ladderMid, midSource, initialBase, cutoff, EPISODE_REQUIRED_MID);

  const initialTop =
    ladderTop === 'day'
      ? nativeDayInitial(topSource, input.cutoffDate, EPISODE_REQUIRED_TOP)
      : foldInitialTier(ladderTop, topSource, initialMid, cutoff, EPISODE_REQUIRED_TOP);

  let replay: QuoteBar[];
  let horizonSessions: number | undefined;
  if (input.horizonBars != null) {
    replay = takeBarsAfter(baseSource, cutoffMs, input.horizonBars);
  } else {
    horizonSessions = input.horizonSessions ?? EPISODE_DEFAULT_HORIZON_SESSIONS;
    replay = takeSessionsAfter(baseSource, cutoffMs, horizonSessions);
  }

  if (initialBase.length < requiredBase) {
    throw new Error(
      `insufficient ${ladderBase} history: need ${requiredBase}, got ${initialBase.length}`,
    );
  }
  if (initialMid.length < EPISODE_REQUIRED_MID) {
    throw new Error(
      `insufficient ${ladderMid} history: need ${EPISODE_REQUIRED_MID}, got ${initialMid.length}`,
    );
  }
  if (initialTop.length < EPISODE_REQUIRED_TOP) {
    throw new Error(
      `insufficient ${ladderTop} history: need ${EPISODE_REQUIRED_TOP}, got ${initialTop.length}`,
    );
  }
  if (input.horizonBars != null) {
    if (replay.length < input.horizonBars) {
      throw new Error(`insufficient replay bars: need ${input.horizonBars}, got ${replay.length}`);
    }
  } else {
    const replaySessions = new Set(replay.map((bar) => marketDate(bar.time))).size;
    if (replaySessions < horizonSessions!) {
      throw new Error(`insufficient replay sessions: need ${horizonSessions}, got ${replaySessions}`);
    }
  }

  const entryExpiryBars =
    input.horizonBars != null
      ? Math.min(
          EPISODE_ENTRY_EXPIRY_SESSIONS * barsPerSession(basePeriod),
          Math.ceil((input.horizonBars * EPISODE_ENTRY_EXPIRY_SESSIONS) / EPISODE_DEFAULT_HORIZON_SESSIONS),
        )
      : barsInFirstSessions(replay, EPISODE_ENTRY_EXPIRY_SESSIONS);

  const dayBars =
    ladderMid === 'day'
      ? initialMid
      : ladderTop === 'day'
        ? initialTop
        : deriveDayBarsFromBase(initialBase);
  const cutoffDay = dayBars.at(-1);
  const previousDay = dayBars.at(-2);

  const question: Question = {
    id: buildQuestionId(input.symbol, input.cutoffDate, 1),
    bank: 'swing',
    symbol: input.symbol,
    cutoff,
    layer: input.layer,
    adversarial: false,
    fixtures: {
      kline: {
        [ladderBase]: initialBase.map(strip),
        [ladderMid]: initialMid.map(strip),
        [ladderTop]: initialTop.map(strip),
      },
      indicators: {
        [ladderMid]: buildDayIndicators(initialMid),
        [ladderTop]: buildWeekIndicators(initialTop),
      },
      quote: {
        last: numberOf(cutoffDay?.close),
        open: numberOf(cutoffDay?.open),
        high: numberOf(cutoffDay?.high),
        low: numberOf(cutoffDay?.low),
        volume: numberOf(cutoffDay?.volume),
        turnover: numberOf(cutoffDay?.turnover),
        prev_close: numberOf(previousDay?.close),
      },
      capitalFlow: {},
      news: [],
      fundamentals: {},
      calendar: input.calendar ?? {},
    },
    replay: {
      basePeriod,
      entryExpiryBars,
      ...(horizonSessions != null ? { horizonSessions } : {}),
      horizonBars: replay.length,
      bars: replay.map(strip),
      rollups: buildReplayRollups(
        ladderMid,
        ladderTop,
        midSource,
        topSource,
        baseSource,
        replay,
        input.horizonBars != null,
      ),
    },
  };

  if (!Value.Check(questionSchema, question)) {
    const first = Value.Errors(questionSchema, question)[0];
    throw new Error(
      `invalid episode question: ${first?.instancePath ?? '(root)'} ${first?.message ?? 'schema mismatch'}`,
    );
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
  basePeriod?: EpisodeBasePeriod;
  horizonSessions?: number;
  horizonBars?: number;
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

function tierLookbackStart(period: EpisodeViewPeriod, cutoffDate: string, required: number): string {
  if (period === 'day' || period === 'week') return '2022-01-01';
  const perSession = Math.ceil(REGULAR_SESSION_MINUTES / EPISODE_INTRADAY_MINUTES[period]);
  const neededSessions = Math.ceil(required / perSession);
  return addDays(cutoffDate, -(Math.ceil(neededSessions * 2.5) + 14));
}

export async function generateEpisodeCase(options: GenerateEpisodeCaseOptions) {
  const log = options.log ?? (() => {});
  const basePeriod = options.basePeriod ?? '1h';
  const [ladderBase, ladderMid, ladderTop] = episodePeriodLadder(basePeriod);
  const sessions =
    options.horizonBars == null ? (options.horizonSessions ?? EPISODE_DEFAULT_HORIZON_SESSIONS) : undefined;
  const neededSessions =
    options.horizonBars != null
      ? Math.ceil(options.horizonBars / barsPerSession(basePeriod))
      : sessions!;
  const rangeEnd = addDays(options.cutoffDate, Math.ceil(neededSessions * 2.5) + 14);

  const baseStart = tierLookbackStart(ladderBase, options.cutoffDate, requiredBaseBars(basePeriod));
  const midStart = tierLookbackStart(ladderMid, options.cutoffDate, EPISODE_REQUIRED_MID);
  const topStart = tierLookbackStart(ladderTop, options.cutoffDate, EPISODE_REQUIRED_TOP);

  log(
    `${options.symbol}: fetching ${ladderBase} ${baseStart}..${rangeEnd}, ${ladderMid}/${ladderTop} history through ${rangeEnd}`,
  );

  const [baseBars, midBars, topBars, calendarEvents] = await Promise.all([
    options.fetchKlineHistory(options.symbol, ladderBase, baseStart, rangeEnd),
    options.fetchKlineHistory(options.symbol, ladderMid, midStart, rangeEnd),
    options.fetchKlineHistory(options.symbol, ladderTop, topStart, rangeEnd),
    options.fetchCalendar
      ? options
          .fetchCalendar(options.symbol, options.cutoffDate, addDays(options.cutoffDate, 180))
          .catch(() => [])
      : Promise.resolve([]),
  ]);

  const question = assembleEpisodeQuestion({
    symbol: options.symbol,
    layer: options.layer,
    cutoffDate: options.cutoffDate,
    basePeriod,
    baseBars,
    midBars,
    topBars,
    horizonSessions: options.horizonBars == null ? sessions : undefined,
    horizonBars: options.horizonBars,
    calendar: { events: calendarEvents },
  });
  const dir = join(options.datasetsRoot, options.version, 'swing');
  const file = join(dir, `${question.id}.json`);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(question, null, 2)}\n`, 'utf8');
  log(
    `${question.id}: ${question.fixtures.kline[ladderBase].length} initial ${ladderBase}, ` +
      `${question.fixtures.kline[ladderMid].length} ${ladderMid}, ${question.fixtures.kline[ladderTop].length} ${ladderTop}, ` +
      `${question.replay.horizonBars} replay ${ladderBase}` +
      (question.replay.horizonSessions != null ? ` across ${question.replay.horizonSessions} sessions` : ''),
  );
  return { question, file };
}
