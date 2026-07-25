import type { RawBar } from '@kansoku/shared/types';
import type { QuoteBar } from '../generate/assemble.js';
import { buildDayIndicators, buildWeekIndicators } from '../generate/indicatorsFixture.js';
import type { EpisodeKlinePeriod } from '../generate/source.js';
import type { Question, ReplayRollupEntry } from '../schema/question.js';
import {
  marketCloseIso,
  marketDate,
  requiredBaseBars,
  EPISODE_REQUIRED_MID,
  EPISODE_REQUIRED_TOP,
} from './generate.js';
import {
  episodePeriodLadder,
  periodBucketKey,
  periodBucketStart,
  EPISODE_PERIOD_LADDER,
  type EpisodeBasePeriod,
  type EpisodeViewPeriod,
} from './periods.js';
import {
  questionBaseBars,
  questionBarsForPeriod,
  questionBasePeriod,
  questionLadder,
  questionRollupsForPeriod,
} from './questionLadder.js';

export type AuditStatus = 'pass' | 'fail';

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
  source: 'question' | 'longbridge-cli';
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
  const parsed = typeof value === 'number' ? value : Number(value);
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
  return (Object.keys(left) as Array<keyof typeof left>).every((key) =>
    sameNumber(left[key], right[key]),
  );
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
  return bars.every(
    (bar, index) => index === 0 || Date.parse(bars[index - 1].time) < Date.parse(bar.time),
  );
}

function stable(value: unknown): string {
  return JSON.stringify(value);
}

function periodToken(period: EpisodeViewPeriod): string {
  return period === '1h' ? 'h1' : period;
}

function periodNoun(period: EpisodeViewPeriod): string {
  if (period === 'day') return '日线';
  if (period === 'week') return '周线';
  return period;
}

function basePeriodLabel(period: EpisodeBasePeriod): string {
  return period === '1h' ? '推进周期为 1 小时' : `推进周期为 ${period}`;
}

function initialWindowLabel(period: EpisodeViewPeriod): string {
  return period === 'day' || period === 'week'
    ? `初始${periodNoun(period)}窗口`
    : `初始 ${period} 窗口`;
}

function sortLabel(period: EpisodeViewPeriod): string {
  return period === 'day' || period === 'week'
    ? `${periodNoun(period)}数据严格递增`
    : `${period} 数据严格递增`;
}

function sourceMatchLabel(period: EpisodeViewPeriod): string {
  return period === 'day' || period === 'week'
    ? `${periodNoun(period)}与长桥 CLI 完整匹配`
    : `${period} 与长桥 CLI 完整匹配`;
}

function sourceHistoryLabel(period: EpisodeViewPeriod): string {
  return period === 'week'
    ? 'cutoff 前完整周线与长桥 CLI 匹配'
    : `cutoff 前完整 ${period} 与长桥 CLI 匹配`;
}

function sourceRollupsLabel(period: EpisodeViewPeriod): string {
  return period === 'week'
    ? '整周结束后的周线与长桥 CLI 匹配'
    : `${period} 周期结束后的数据与长桥 CLI 匹配`;
}

function indicatorsLabel(mid: EpisodeViewPeriod, top: EpisodeViewPeriod): string {
  return mid === 'day' && top === 'week'
    ? '指标只由当前可见日线和周线重算'
    : `指标只由当前可见 ${mid} 和 ${top} 重算`;
}

function baseSessionSpanLabel(period: EpisodeViewPeriod): string {
  return `${period} 基础层至少跨两个交易日，折算 quote 才有效`;
}

function rollupCountLabel(period: EpisodeViewPeriod): string {
  return period === 'day'
    ? '每个回放交易日都有长桥原生日线'
    : `每个已完成的 ${period} 周期都有长桥原生数据`;
}

function partialBucketLabel(period: EpisodeViewPeriod, lowerPeriod: EpisodeViewPeriod): string {
  return period === 'week' && lowerPeriod === 'day'
    ? 'cutoff 当周仅聚合已完成日线'
    : `cutoff 当前 ${period} 仅聚合已完成 ${lowerPeriod}`;
}

function partialBucketDetail(period: EpisodeViewPeriod): string {
  return period === 'week'
    ? '不得直接使用长桥返回的完整历史周线；该周线可能包含 cutoff 之后的交易日。'
    : `不得直接使用长桥返回的完整历史 ${period} 数据；该数据可能包含 cutoff 之后的时间段。`;
}

function distinctBucketCount(period: EpisodeViewPeriod, bars: RawBar[]): number {
  return new Set(bars.map((bar) => periodBucketKey(period, bar.time))).size;
}

function foldByDay(bars: RawBar[]): RawBar[] {
  const groups = new Map<string, RawBar[]>();
  for (const bar of bars) {
    const key = periodBucketKey('day', bar.time);
    const group = groups.get(key);
    if (group) group.push(bar);
    else groups.set(key, [bar]);
  }
  return [...groups.values()]
    .map((group) => aggregate(periodBucketStart('day', group[0].time), group as QuoteBar[]))
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
}

function partialBucketAggregate(
  period: EpisodeViewPeriod,
  lowerBars: RawBar[],
  cutoffIso: string,
): RawBar | null {
  const cutoffBucketStart = periodBucketStart(period, cutoffIso);
  const currentLower = lowerBars.filter(
    (bar) => periodBucketStart(period, bar.time) === cutoffBucketStart,
  ) as QuoteBar[];
  return currentLower.length > 0 ? aggregate(cutoffBucketStart, currentLower) : null;
}

function bucketFixture(
  period: EpisodeViewPeriod,
  tierBars: RawBar[],
  cutoffIso: string,
): RawBar | undefined {
  const cutoffBucketStart = periodBucketStart(period, cutoffIso);
  return tierBars.find((bar) => periodBucketStart(period, bar.time) === cutoffBucketStart);
}

function sourceDayTurnover(bars: QuoteBar[], cutoffIso: string): number | null {
  const key = periodBucketStart('day', cutoffIso);
  const matches = bars.filter((bar) => periodBucketStart('day', bar.time) === key);
  if (matches.length === 0) return null;
  let sum = 0;
  for (const bar of matches) {
    const value = numberOf(bar.turnover);
    if (value == null) return null;
    sum += value;
  }
  return sum;
}

function auditTierAgainstSource(
  period: EpisodeViewPeriod,
  initialTierBars: RawBar[],
  rollupsForTier: ReplayRollupEntry[],
  sourceBars: QuoteBar[],
  cutoffIso: string,
  add: (
    id: string,
    label: string,
    passed: boolean,
    expected: unknown,
    actual: unknown,
    detail?: string,
  ) => void,
): void {
  if (period === 'day') {
    const expected = [...initialTierBars, ...rollupsForTier.map((item) => item.bar)];
    const comparison = compareBars(expected, sourceBars, (bar) =>
      periodBucketKey(period, bar.time),
    );
    add(
      `source-${periodToken(period)}`,
      sourceMatchLabel(period),
      comparison.passed,
      comparison.expectedCount,
      comparison.actualCount,
      comparison.firstMismatch ?? undefined,
    );
    return;
  }

  const cutoffBucketStart = periodBucketStart(period, cutoffIso);
  const completedInitial = initialTierBars.filter(
    (bar) => periodBucketStart(period, bar.time) < cutoffBucketStart,
  );
  const historyComparison = compareBars(completedInitial, sourceBars, (bar) =>
    periodBucketKey(period, bar.time),
  );
  add(
    `source-${periodToken(period)}-history`,
    sourceHistoryLabel(period),
    historyComparison.passed,
    historyComparison.expectedCount,
    historyComparison.actualCount,
    historyComparison.firstMismatch ?? undefined,
  );

  const future = rollupsForTier.map((item) => item.bar);
  const rollupsComparison = compareBars(future, sourceBars, (bar) =>
    periodBucketKey(period, bar.time),
  );
  add(
    `source-${periodToken(period)}-rollups`,
    sourceRollupsLabel(period),
    rollupsComparison.passed,
    rollupsComparison.expectedCount,
    rollupsComparison.actualCount,
    rollupsComparison.firstMismatch ?? undefined,
  );
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
  ) =>
    checks.push({
      id,
      label,
      status: passed ? 'pass' : 'fail',
      expected,
      actual,
      ...(detail ? { detail } : {}),
    });

  const rawBasePeriod = questionBasePeriod(question);
  const knownBasePeriod = Object.hasOwn(EPISODE_PERIOD_LADDER, rawBasePeriod);
  const basePeriod = knownBasePeriod ? rawBasePeriod : '1h';
  const [ladderBase, ladderMid, ladderTop] = episodePeriodLadder(basePeriod);
  const requiredBase = requiredBaseBars(basePeriod);

  const initialBase = questionBaseBars(question);
  const initialMid = questionBarsForPeriod(question, ladderMid);
  const initialTop = questionBarsForPeriod(question, ladderTop);
  const replay = question.replay.bars;
  const rollupsMid = questionRollupsForPeriod(question, ladderMid);
  const rollupsTop = questionRollupsForPeriod(question, ladderTop);
  const cutoffDate = marketDate(question.cutoff);
  const sessions = sessionCount(replay);
  const expiryBars = firstSessionBarCount(replay, 3);

  add(
    'base-period',
    basePeriodLabel(rawBasePeriod),
    knownBasePeriod,
    Object.keys(EPISODE_PERIOD_LADDER),
    question.replay.basePeriod ?? null,
  );
  add(
    `initial-${periodToken(ladderBase)}-count`,
    initialWindowLabel(ladderBase),
    initialBase.length === requiredBase,
    requiredBase,
    initialBase.length,
  );
  add(
    `initial-${periodToken(ladderMid)}-count`,
    initialWindowLabel(ladderMid),
    initialMid.length === EPISODE_REQUIRED_MID,
    EPISODE_REQUIRED_MID,
    initialMid.length,
  );
  add(
    `initial-${periodToken(ladderTop)}-count`,
    initialWindowLabel(ladderTop),
    initialTop.length === EPISODE_REQUIRED_TOP,
    EPISODE_REQUIRED_TOP,
    initialTop.length,
  );
  if (ladderMid !== 'day' && ladderTop !== 'day') {
    const initialBaseSessions = sessionCount(initialBase);
    add(
      `${periodToken(ladderBase)}-session-span`,
      baseSessionSpanLabel(ladderBase),
      initialBaseSessions >= 2,
      2,
      initialBaseSessions,
    );
  }
  add(
    'horizon-bars',
    '回放 bar 数',
    question.replay.horizonBars === replay.length,
    replay.length,
    question.replay.horizonBars,
  );
  add(
    'horizon-sessions',
    '回放交易日数',
    question.replay.horizonSessions === sessions,
    sessions,
    question.replay.horizonSessions ?? null,
  );
  add(
    'decision-window',
    'B0 起可交易且没有强制决策窗口',
    question.replay.decisionExpiryBars == null,
    null,
    question.replay.decisionExpiryBars ?? null,
  );
  add(
    'entry-expiry',
    '待成交窗口覆盖前三个交易日',
    question.replay.entryExpiryBars === expiryBars,
    expiryBars,
    question.replay.entryExpiryBars ?? null,
  );
  add(
    `${periodToken(ladderMid)}-rollup-count`,
    rollupCountLabel(ladderMid),
    rollupsMid.length === distinctBucketCount(ladderMid, replay),
    distinctBucketCount(ladderMid, replay),
    rollupsMid.length,
  );
  add(
    `sort-${periodToken(ladderBase)}`,
    sortLabel(ladderBase),
    strictlyIncreasing([...initialBase, ...replay]),
    true,
    strictlyIncreasing([...initialBase, ...replay]),
  );
  add(
    `sort-${periodToken(ladderMid)}`,
    sortLabel(ladderMid),
    strictlyIncreasing(initialMid),
    true,
    strictlyIncreasing(initialMid),
  );
  add(
    `sort-${periodToken(ladderTop)}`,
    sortLabel(ladderTop),
    strictlyIncreasing(initialTop),
    true,
    strictlyIncreasing(initialTop),
  );
  add(
    'cutoff-timezone',
    'cutoff 使用纽约收盘时间和正确 DST',
    question.cutoff === marketCloseIso(cutoffDate),
    marketCloseIso(cutoffDate),
    question.cutoff,
  );
  add(
    'visibility-boundary',
    `初始 ${ladderBase} 与回放在 cutoff 两侧无重叠`,
    initialBase.every((bar) => Date.parse(bar.time) < Date.parse(question.cutoff)) &&
      replay.every((bar) => Date.parse(bar.time) >= Date.parse(question.cutoff)),
    'initial < cutoff <= replay',
    { initialLast: initialBase.at(-1)?.time ?? null, replayFirst: replay[0]?.time ?? null },
  );

  const initialTierBarsByPeriod: Partial<Record<EpisodeViewPeriod, RawBar[]>> = {
    [ladderBase]: initialBase,
    [ladderMid]: initialMid,
    [ladderTop]: initialTop,
  };
  const quoteDays = initialTierBarsByPeriod.day?.length
    ? initialTierBarsByPeriod.day
    : foldByDay(initialBase);
  const cutoffDay = quoteDays.at(-1);
  const previousDay = quoteDays.at(-2);
  const quote = question.fixtures.quote as Record<string, unknown>;
  const quotePassed =
    cutoffDay != null &&
    sameNumber(numberOf(cutoffDay.close), numberOf(quote.last as number | string | undefined)) &&
    sameNumber(numberOf(cutoffDay.open), numberOf(quote.open as number | string | undefined)) &&
    sameNumber(numberOf(cutoffDay.high), numberOf(quote.high as number | string | undefined)) &&
    sameNumber(numberOf(cutoffDay.low), numberOf(quote.low as number | string | undefined)) &&
    sameNumber(numberOf(cutoffDay.volume), numberOf(quote.volume as number | string | undefined)) &&
    sameNumber(
      numberOf(previousDay?.close),
      numberOf(quote.prev_close as number | string | undefined),
    );
  add(
    'quote',
    'quote 与 cutoff 长桥原生日线一致',
    quotePassed,
    cutoffDay ? numericBar(cutoffDay) : null,
    quote,
  );

  const expectedIndicators = {
    [ladderMid]: buildDayIndicators(initialMid),
    [ladderTop]: buildWeekIndicators(initialTop),
  };
  const actualIndicators = {
    [ladderMid]: (question.fixtures.indicators as Record<string, unknown>)[ladderMid],
    [ladderTop]: (question.fixtures.indicators as Record<string, unknown>)[ladderTop],
  };
  add(
    'indicators',
    indicatorsLabel(ladderMid, ladderTop),
    stable(expectedIndicators) === stable(actualIndicators),
    expectedIndicators,
    actualIndicators,
  );

  if (ladderMid !== 'day') {
    const safe = partialBucketAggregate(ladderMid, initialBase, question.cutoff);
    const fixture = bucketFixture(ladderMid, initialMid, question.cutoff);
    add(
      `partial-${periodToken(ladderMid)}`,
      partialBucketLabel(ladderMid, ladderBase),
      safe == null ? fixture == null : fixture != null && sameBar(fixture, safe),
      safe,
      fixture ?? null,
      partialBucketDetail(ladderMid),
    );
  }
  if (ladderTop !== 'day') {
    const safe = partialBucketAggregate(ladderTop, initialMid, question.cutoff);
    const fixture = bucketFixture(ladderTop, initialTop, question.cutoff);
    add(
      `partial-${periodToken(ladderTop)}`,
      partialBucketLabel(ladderTop, ladderMid),
      safe == null ? fixture == null : fixture != null && sameBar(fixture, safe),
      safe,
      fixture ?? null,
      partialBucketDetail(ladderTop),
    );
  }

  if (sources) {
    const baseSourceBars = sources.hourBars;
    const midSourceBars = sources.dayBars;
    const topSourceBars = sources.weekBars;

    const expectedBase = [...initialBase, ...replay];
    const baseComparison = compareBars(expectedBase, baseSourceBars, (bar) => bar.time);
    add(
      `source-${periodToken(ladderBase)}`,
      sourceMatchLabel(ladderBase),
      baseComparison.passed,
      baseComparison.expectedCount,
      baseComparison.actualCount,
      baseComparison.firstMismatch ?? undefined,
    );

    auditTierAgainstSource(ladderMid, initialMid, rollupsMid, midSourceBars, question.cutoff, add);
    auditTierAgainstSource(ladderTop, initialTop, rollupsTop, topSourceBars, question.cutoff, add);

    const turnoverSourceBars =
      ladderMid === 'day' ? midSourceBars : ladderTop === 'day' ? topSourceBars : baseSourceBars;
    const sourceTurnover = sourceDayTurnover(turnoverSourceBars, question.cutoff);
    add(
      'source-quote-turnover',
      'cutoff 成交额与长桥日线匹配',
      sameNumber(sourceTurnover, numberOf(quote.turnover as number | string | undefined)),
      sourceTurnover,
      numberOf(quote.turnover as number | string | undefined),
    );
  }

  return {
    questionId: question.id,
    symbol: question.symbol,
    auditedAt,
    source: sources ? 'longbridge-cli' : 'question',
    passed: checks.every((check) => check.status === 'pass'),
    checks,
    configuration: {
      cutoff: question.cutoff,
      basePeriod: question.replay.basePeriod ?? null,
      initialBars: { h1: initialBase.length, day: initialMid.length, week: initialTop.length },
      horizonSessions: question.replay.horizonSessions ?? null,
      horizonBars: question.replay.horizonBars,
      decisionExpiryBars: question.replay.decisionExpiryBars ?? null,
      entryExpiryBars: question.replay.entryExpiryBars ?? null,
      dayRollups: rollupsMid.length,
      weekRollups: rollupsTop.length,
    },
  };
}

export async function auditEpisodeQuestionLive(
  question: Question,
  fetchKlineHistory: FetchEpisodeAuditKlines,
): Promise<EpisodeDataAudit> {
  const [ladderBase, ladderMid, ladderTop] = questionLadder(question);
  const initialBase = questionBaseBars(question);
  const firstBase = initialBase[0];
  const lastBase = question.replay.bars.at(-1);
  const firstMid = questionBarsForPeriod(question, ladderMid)[0];
  const firstTop = questionBarsForPeriod(question, ladderTop)[0];
  if (!firstBase || !lastBase || !firstMid || !firstTop)
    throw new Error('episode question is missing audit ranges');

  const end = marketDate(lastBase.time);
  const [hourBars, dayBars, weekBars] = await Promise.all([
    fetchKlineHistory(question.symbol, ladderBase, marketDate(firstBase.time), end),
    fetchKlineHistory(question.symbol, ladderMid, marketDate(firstMid.time), end),
    fetchKlineHistory(question.symbol, ladderTop, marketDate(firstTop.time), end),
  ]);
  return auditEpisodeQuestion(question, { hourBars, dayBars, weekBars });
}
