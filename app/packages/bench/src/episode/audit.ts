import type { RawBar } from "../../../../shared/types.js";
import type { QuoteBar } from "../generate/assemble.js";
import { buildDayIndicators, buildWeekIndicators } from "../generate/indicatorsFixture.js";
import type { EpisodeKlinePeriod } from "../generate/source.js";
import type { Question } from "../schema/question.js";
import {
  EPISODE_REQUIRED_DAY,
  EPISODE_REQUIRED_H1,
  EPISODE_REQUIRED_WEEK,
  marketCloseIso,
  marketDate,
  weekKey,
} from "./generate.js";

export type AuditStatus = "pass" | "fail";

export interface EpisodeAuditCheck {
  id: string;
  label: string;
  status: AuditStatus;
  expected: unknown;
  actual: unknown;
  detail?: string;
}

export interface EpisodeDataAudit {
  questionId: string;
  symbol: string;
  auditedAt: string;
  source: "question" | "longbridge-cli";
  passed: boolean;
  checks: EpisodeAuditCheck[];
  configuration: {
    cutoff: string;
    basePeriod: string | null;
    initialBars: { h1: number; day: number; week: number };
    horizonSessions: number | null;
    horizonBars: number;
    decisionExpiryBars: number | null;
    entryExpiryBars: number | null;
    dayRollups: number;
    weekRollups: number;
  };
}

export interface EpisodeAuditSources {
  hourBars: QuoteBar[];
  dayBars: QuoteBar[];
  weekBars: QuoteBar[];
}

export type FetchEpisodeAuditKlines = (
  symbol: string,
  period: EpisodeKlinePeriod,
  start: string,
  end: string,
) => Promise<QuoteBar[]>;

function numberOf(value: string | number | undefined): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numericBar(bar: RawBar) {
  return {
    open: numberOf(bar.open),
    high: numberOf(bar.high),
    low: numberOf(bar.low),
    close: numberOf(bar.close),
    volume: numberOf(bar.volume),
  };
}

function sameNumber(a: number | null, b: number | null): boolean {
  if (a == null || b == null) return a === b;
  return Math.abs(a - b) <= 1e-9;
}

function sameBar(a: RawBar, b: RawBar): boolean {
  const left = numericBar(a);
  const right = numericBar(b);
  return (Object.keys(left) as Array<keyof typeof left>).every((key) => sameNumber(left[key], right[key]));
}

function compareBars(
  expected: RawBar[],
  actual: RawBar[],
  keyOf: (bar: RawBar) => string,
): { passed: boolean; expectedCount: number; actualCount: number; firstMismatch: string | null } {
  const expectedKeys = new Set(expected.map(keyOf));
  const selectedActual = actual.filter((bar) => expectedKeys.has(keyOf(bar)));
  const actualByKey = new Map(selectedActual.map((bar) => [keyOf(bar), bar]));
  let firstMismatch: string | null = null;
  for (const bar of expected) {
    const key = keyOf(bar);
    const reference = actualByKey.get(key);
    if (!reference || !sameBar(bar, reference)) {
      firstMismatch = key;
      break;
    }
  }
  return {
    passed: firstMismatch == null && selectedActual.length === expected.length,
    expectedCount: expected.length,
    actualCount: selectedActual.length,
    firstMismatch,
  };
}

function aggregate(key: string, bars: QuoteBar[]): RawBar {
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

function sessionCount(bars: RawBar[]): number {
  return new Set(bars.map((bar) => marketDate(bar.time))).size;
}

function firstSessionBarCount(bars: RawBar[], sessions: number): number {
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

function strictlyIncreasing(bars: RawBar[]): boolean {
  return bars.every((bar, index) => index === 0 || Date.parse(bars[index - 1].time) < Date.parse(bar.time));
}

function stable(value: unknown): string {
  return JSON.stringify(value);
}

export function auditEpisodeQuestion(
  question: Question,
  sources?: EpisodeAuditSources,
  auditedAt = new Date().toISOString(),
): EpisodeDataAudit {
  const checks: EpisodeAuditCheck[] = [];
  const add = (
    id: string,
    label: string,
    passed: boolean,
    expected: unknown,
    actual: unknown,
    detail?: string,
  ) => checks.push({ id, label, status: passed ? "pass" : "fail", expected, actual, ...(detail ? { detail } : {}) });

  const initialH1 = question.fixtures.kline["1h"] ?? [];
  const initialDay = question.fixtures.kline.day ?? [];
  const initialWeek = question.fixtures.kline.week ?? [];
  const replay = question.replay.bars;
  const rollups = question.replay.rollups ?? { day: [], week: [] };
  const cutoffDate = marketDate(question.cutoff);
  const cutoffWeek = weekKey(cutoffDate);
  const sessions = sessionCount(replay);
  const expiryBars = firstSessionBarCount(replay, 3);

  add("base-period", "推进周期为 1 小时", question.replay.basePeriod === "1h", "1h", question.replay.basePeriod ?? null);
  add("initial-h1-count", "初始 1h 窗口", initialH1.length === EPISODE_REQUIRED_H1, EPISODE_REQUIRED_H1, initialH1.length);
  add("initial-day-count", "初始日线窗口", initialDay.length === EPISODE_REQUIRED_DAY, EPISODE_REQUIRED_DAY, initialDay.length);
  add("initial-week-count", "初始周线窗口", initialWeek.length === EPISODE_REQUIRED_WEEK, EPISODE_REQUIRED_WEEK, initialWeek.length);
  add("horizon-bars", "回放 bar 数", question.replay.horizonBars === replay.length, replay.length, question.replay.horizonBars);
  add("horizon-sessions", "回放交易日数", question.replay.horizonSessions === sessions, sessions, question.replay.horizonSessions ?? null);
  add("decision-window", "B0 起可交易且没有强制决策窗口", question.replay.decisionExpiryBars == null, null, question.replay.decisionExpiryBars ?? null);
  add("entry-expiry", "待成交窗口覆盖前三个交易日", question.replay.entryExpiryBars === expiryBars, expiryBars, question.replay.entryExpiryBars ?? null);
  add("day-rollup-count", "每个回放交易日都有长桥原生日线", rollups.day.length === sessions, sessions, rollups.day.length);
  add("sort-h1", "1h 数据严格递增", strictlyIncreasing([...initialH1, ...replay]), true, strictlyIncreasing([...initialH1, ...replay]));
  add("sort-day", "日线数据严格递增", strictlyIncreasing(initialDay), true, strictlyIncreasing(initialDay));
  add("sort-week", "周线数据严格递增", strictlyIncreasing(initialWeek), true, strictlyIncreasing(initialWeek));
  add("cutoff-timezone", "cutoff 使用纽约收盘时间和正确 DST", question.cutoff === marketCloseIso(cutoffDate), marketCloseIso(cutoffDate), question.cutoff);
  add(
    "visibility-boundary",
    "初始 1h 与回放在 cutoff 两侧无重叠",
    initialH1.every((bar) => Date.parse(bar.time) < Date.parse(question.cutoff)) && replay.every((bar) => Date.parse(bar.time) >= Date.parse(question.cutoff)),
    "initial < cutoff <= replay",
    { initialLast: initialH1.at(-1)?.time ?? null, replayFirst: replay[0]?.time ?? null },
  );

  const cutoffDay = initialDay.at(-1);
  const previousDay = initialDay.at(-2);
  const quote = question.fixtures.quote as Record<string, unknown>;
  const quotePassed = cutoffDay != null
    && sameNumber(numberOf(cutoffDay.close), numberOf(quote.last as number | string | undefined))
    && sameNumber(numberOf(cutoffDay.open), numberOf(quote.open as number | string | undefined))
    && sameNumber(numberOf(cutoffDay.high), numberOf(quote.high as number | string | undefined))
    && sameNumber(numberOf(cutoffDay.low), numberOf(quote.low as number | string | undefined))
    && sameNumber(numberOf(cutoffDay.volume), numberOf(quote.volume as number | string | undefined))
    && sameNumber(numberOf(previousDay?.close), numberOf(quote.prev_close as number | string | undefined));
  add("quote", "quote 与 cutoff 长桥原生日线一致", quotePassed, cutoffDay ? numericBar(cutoffDay) : null, quote);

  const expectedIndicators = { day: buildDayIndicators(initialDay), week: buildWeekIndicators(initialWeek) };
  const actualIndicators = {
    day: (question.fixtures.indicators as Record<string, unknown>).day,
    week: (question.fixtures.indicators as Record<string, unknown>).week,
  };
  add("indicators", "指标只由当前可见日线和周线重算", stable(expectedIndicators) === stable(actualIndicators), expectedIndicators, actualIndicators);

  const currentWeekDays = initialDay.filter((bar) => weekKey(marketDate(bar.time)) === cutoffWeek) as QuoteBar[];
  const currentWeekFixture = initialWeek.find((bar) => weekKey(marketDate(bar.time)) === cutoffWeek);
  const safeCurrentWeek = currentWeekDays.length > 0 ? aggregate(cutoffWeek, currentWeekDays) : null;
  add(
    "partial-week",
    "cutoff 当周仅聚合已完成日线",
    currentWeekFixture != null && safeCurrentWeek != null && sameBar(currentWeekFixture, safeCurrentWeek),
    safeCurrentWeek,
    currentWeekFixture ?? null,
    "不得直接使用长桥返回的完整历史周线；该周线可能包含 cutoff 之后的交易日。",
  );

  if (sources) {
    const expectedH1 = [...initialH1, ...replay];
    const h1Comparison = compareBars(expectedH1, sources.hourBars, (bar) => bar.time);
    add("source-h1", "1h 与长桥 CLI 完整匹配", h1Comparison.passed, h1Comparison.expectedCount, h1Comparison.actualCount, h1Comparison.firstMismatch ?? undefined);

    const expectedDays = [...initialDay, ...rollups.day.map((item) => item.bar)];
    const dayComparison = compareBars(expectedDays, sources.dayBars, (bar) => marketDate(bar.time));
    add("source-day", "日线与长桥 CLI 完整匹配", dayComparison.passed, dayComparison.expectedCount, dayComparison.actualCount, dayComparison.firstMismatch ?? undefined);

    const completedInitialWeeks = initialWeek.filter((bar) => weekKey(marketDate(bar.time)) < cutoffWeek);
    const completedWeekComparison = compareBars(completedInitialWeeks, sources.weekBars, (bar) => weekKey(marketDate(bar.time)));
    add(
      "source-week-history",
      "cutoff 前完整周线与长桥 CLI 匹配",
      completedWeekComparison.passed,
      completedWeekComparison.expectedCount,
      completedWeekComparison.actualCount,
      completedWeekComparison.firstMismatch ?? undefined,
    );

    const futureWeeks = rollups.week.map((item) => item.bar);
    const rollupWeekComparison = compareBars(futureWeeks, sources.weekBars, (bar) => weekKey(marketDate(bar.time)));
    add("source-week-rollups", "整周结束后的周线与长桥 CLI 匹配", rollupWeekComparison.passed, rollupWeekComparison.expectedCount, rollupWeekComparison.actualCount, rollupWeekComparison.firstMismatch ?? undefined);

    const sourceCutoffDay = sources.dayBars.find((bar) => marketDate(bar.time) === cutoffDate);
    const sourceTurnover = numberOf(sourceCutoffDay?.turnover);
    add(
      "source-quote-turnover",
      "cutoff 成交额与长桥日线匹配",
      sameNumber(sourceTurnover, numberOf(quote.turnover as number | string | undefined)),
      sourceTurnover,
      numberOf(quote.turnover as number | string | undefined),
    );
  }

  return {
    questionId: question.id,
    symbol: question.symbol,
    auditedAt,
    source: sources ? "longbridge-cli" : "question",
    passed: checks.every((check) => check.status === "pass"),
    checks,
    configuration: {
      cutoff: question.cutoff,
      basePeriod: question.replay.basePeriod ?? null,
      initialBars: { h1: initialH1.length, day: initialDay.length, week: initialWeek.length },
      horizonSessions: question.replay.horizonSessions ?? null,
      horizonBars: question.replay.horizonBars,
      decisionExpiryBars: question.replay.decisionExpiryBars ?? null,
      entryExpiryBars: question.replay.entryExpiryBars ?? null,
      dayRollups: rollups.day.length,
      weekRollups: rollups.week.length,
    },
  };
}

export async function auditEpisodeQuestionLive(
  question: Question,
  fetchKlineHistory: FetchEpisodeAuditKlines,
): Promise<EpisodeDataAudit> {
  const initialH1 = question.fixtures.kline["1h"] ?? [];
  const firstHour = initialH1[0];
  const lastHour = question.replay.bars.at(-1);
  const firstDay = question.fixtures.kline.day?.[0];
  const firstWeek = question.fixtures.kline.week?.[0];
  if (!firstHour || !lastHour || !firstDay || !firstWeek) throw new Error("episode question is missing audit ranges");

  const end = marketDate(lastHour.time);
  const [hourBars, dayBars, weekBars] = await Promise.all([
    fetchKlineHistory(question.symbol, "1h", marketDate(firstHour.time), end),
    fetchKlineHistory(question.symbol, "day", marketDate(firstDay.time), end),
    fetchKlineHistory(question.symbol, "week", marketDate(firstWeek.time), end),
  ]);
  return auditEpisodeQuestion(question, { hourBars, dayBars, weekBars });
}
