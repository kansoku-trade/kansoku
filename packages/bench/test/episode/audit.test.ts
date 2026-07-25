import { describe, expect, it } from 'vitest';
import type { QuoteBar } from '../../src/generate/assemble.js';
import { auditEpisodeQuestion } from '../../src/episode/audit.js';
import { assembleEpisodeQuestion } from '../../src/episode/generate.js';
import { periodBucketStart } from '../../src/episode/periods.js';

function dateOffset(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function businessDates(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let cursor = start; cursor <= end; cursor = dateOffset(cursor, 1)) {
    const day = new Date(`${cursor}T12:00:00Z`).getUTCDay();
    if (day !== 0 && day !== 6) dates.push(cursor);
  }
  return dates;
}

function bar(time: string, index: number): QuoteBar {
  const close = 100 + index / 10;
  return {
    time,
    open: String(close - 0.2),
    high: String(close + 0.5),
    low: String(close - 0.5),
    close: String(close),
    volume: String(1_000_000 + index),
    turnover: String((1_000_000 + index) * close),
  };
}

function timeAt(date: string, minutesSinceMidnight: number): string {
  const hour = Math.floor(minutesSinceMidnight / 60);
  const minute = minutesSinceMidnight % 60;
  return `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-04:00`;
}

function sessionBars(date: string, minutes: number, startIndex: number): QuoteBar[] {
  const count = Math.ceil(390 / minutes);
  return Array.from({ length: count }, (_, i) =>
    bar(timeAt(date, 570 + i * minutes), startIndex + i),
  );
}

function intradayBarsForDates(dates: string[], minutes: number): QuoteBar[] {
  let index = 0;
  return dates.flatMap((date) => {
    const bars = sessionBars(date, minutes, index);
    index += bars.length;
    return bars;
  });
}

function fivePeriodFixture(cutoffDate = '2026-03-25', horizonSessions = 4) {
  const pastDates = businessDates(dateOffset(cutoffDate, -60), cutoffDate);
  const futureDates = businessDates(dateOffset(cutoffDate, 1), dateOffset(cutoffDate, 20)).slice(
    0,
    horizonSessions,
  );
  const allDates = [...pastDates, ...futureDates];
  return assembleEpisodeQuestion({
    symbol: 'MRVL.US',
    layer: 'high-vol-tech',
    cutoffDate,
    basePeriod: '5m',
    baseBars: intradayBarsForDates(allDates, 5),
    midBars: intradayBarsForDates(allDates, 15),
    topBars: intradayBarsForDates(allDates, 60),
    horizonSessions,
    calendar: {},
  });
}

function onePeriodFixture(cutoffDate = '2026-03-25', horizonSessions = 4) {
  const pastDates = businessDates(dateOffset(cutoffDate, -20), cutoffDate);
  const futureDates = businessDates(dateOffset(cutoffDate, 1), dateOffset(cutoffDate, 20)).slice(
    0,
    horizonSessions,
  );
  const allDates = [...pastDates, ...futureDates];
  return assembleEpisodeQuestion({
    symbol: 'MRVL.US',
    layer: 'high-vol-tech',
    cutoffDate,
    basePeriod: '1m',
    baseBars: intradayBarsForDates(allDates, 1),
    midBars: intradayBarsForDates(allDates, 5),
    topBars: intradayBarsForDates(allDates, 15),
    horizonSessions,
    calendar: {},
  });
}

function fifteenPeriodFixture(cutoffDate = '2026-03-25', horizonSessions = 4) {
  const pastDates = businessDates(dateOffset(cutoffDate, -60), cutoffDate);
  const futureDates = businessDates(dateOffset(cutoffDate, 1), dateOffset(cutoffDate, 20)).slice(
    0,
    horizonSessions,
  );
  const allDates = [...pastDates, ...futureDates];
  const baseBars = intradayBarsForDates(allDates, 15);
  const midBars = intradayBarsForDates(allDates, 60);
  const topBars = businessDates(dateOffset(cutoffDate, -500), dateOffset(cutoffDate, 20)).map(
    (date, index) => bar(`${date}T20:00:00Z`, index),
  );
  const question = assembleEpisodeQuestion({
    symbol: 'MRVL.US',
    layer: 'high-vol-tech',
    cutoffDate,
    basePeriod: '15m',
    baseBars,
    midBars,
    topBars,
    horizonSessions,
    calendar: {},
  });
  return { question, sources: { hourBars: baseBars, dayBars: midBars, weekBars: topBars } };
}

function fixture() {
  const cutoffDate = '2026-03-25';
  const dates = businessDates(dateOffset(cutoffDate, -60), dateOffset(cutoffDate, 20));
  const hourDates = [
    ...dates.filter((date) => date <= cutoffDate).slice(-30),
    ...dates.filter((date) => date > cutoffDate).slice(0, 4),
  ];
  const hourBars = hourDates.flatMap((date, dateIndex) =>
    Array.from({ length: 7 }, (_, hourIndex) =>
      bar(
        `${date}T${String(9 + hourIndex).padStart(2, '0')}:30:00-04:00`,
        dateIndex * 7 + hourIndex,
      ),
    ),
  );
  const dayBars = businessDates(dateOffset(cutoffDate, -500), dateOffset(cutoffDate, 20)).map(
    (date, index) => bar(`${date}T20:00:00Z`, index),
  );
  const weekBars = Array.from({ length: 122 }, (_, index) =>
    bar(`${dateOffset(cutoffDate, (index - 120) * 7)}T20:00:00Z`, index),
  );
  const question = assembleEpisodeQuestion({
    symbol: 'MU.US',
    layer: 'high-vol-tech',
    cutoffDate,
    hourBars,
    dayBars,
    weekBars,
    horizonSessions: 4,
  });
  return { question, sources: { hourBars, dayBars, weekBars } };
}

describe('episode data audit', () => {
  it('validates configuration, visibility boundaries, rollups, and source bars', () => {
    const { question, sources } = fixture();
    const audit = auditEpisodeQuestion(question, sources, '2026-07-18T00:00:00.000Z');
    expect(audit.passed).toBe(true);
    expect(audit.source).toBe('longbridge-cli');
    expect(audit.checks.every((check) => check.status === 'pass')).toBe(true);
    expect(audit.checks.map((check) => check.id)).toContain('partial-week');
    expect(audit.checks.map((check) => check.id)).toContain('source-week-rollups');
  });

  it('detects a persisted day rollup that differs from the source', () => {
    const { question, sources } = fixture();
    question.replay.rollups!.day[0].bar.close = 9_999;
    const audit = auditEpisodeQuestion(question, sources, '2026-07-18T00:00:00.000Z');
    expect(audit.passed).toBe(false);
    expect(audit.checks.find((check) => check.id === 'source-day')).toMatchObject({
      status: 'fail',
    });
  });

  it('fails, naming the base period, when the basePeriod field is missing', () => {
    const { question, sources } = fixture();
    delete question.replay.basePeriod;
    const audit = auditEpisodeQuestion(question, sources, '2026-07-18T00:00:00.000Z');
    expect(audit.passed).toBe(false);
    expect(audit.checks.find((check) => check.id === 'base-period')).toMatchObject({
      status: 'fail',
      actual: null,
    });
  });

  it('runs exactly the same checks for a 1h case as before the ladder generalisation', () => {
    const { question, sources } = fixture();
    const audit = auditEpisodeQuestion(question, sources, '2026-07-18T00:00:00.000Z');
    expect(audit.checks.map((check) => check.id)).toEqual([
      'base-period',
      'initial-h1-count',
      'initial-day-count',
      'initial-week-count',
      'horizon-bars',
      'horizon-sessions',
      'decision-window',
      'entry-expiry',
      'day-rollup-count',
      'sort-h1',
      'sort-day',
      'sort-week',
      'cutoff-timezone',
      'visibility-boundary',
      'quote',
      'indicators',
      'partial-week',
      'source-h1',
      'source-day',
      'source-week-history',
      'source-week-rollups',
      'source-quote-turnover',
    ]);
  });
});

describe('episode data audit — five-period ladder', () => {
  it('passes a well-formed 5m case', () => {
    const question = fivePeriodFixture();
    const audit = auditEpisodeQuestion(question);
    expect(audit.passed).toBe(true);
    expect(audit.checks.every((check) => check.status === 'pass')).toBe(true);
  });

  it('passes a well-formed 1m case, requiring 780 base bars', () => {
    const question = onePeriodFixture();
    expect(question.fixtures.kline['1m']).toHaveLength(780);
    const audit = auditEpisodeQuestion(question);
    expect(audit.checks.find((check) => check.id === 'initial-1m-count')).toMatchObject({
      status: 'pass',
      expected: 780,
      actual: 780,
    });
    expect(audit.passed).toBe(true);
  });

  it('fails, naming the base tier, when the base window is short', () => {
    const question = fivePeriodFixture();
    question.fixtures.kline['5m'] = question.fixtures.kline['5m']!.slice(1);
    const audit = auditEpisodeQuestion(question);
    expect(audit.passed).toBe(false);
    expect(audit.checks.find((check) => check.id === 'initial-5m-count')).toMatchObject({
      status: 'fail',
    });
  });

  it('fails, naming the base tier, when the base bars meet the count requirement but all sit inside one trading day', () => {
    const question = fivePeriodFixture();
    const baseBars = question.fixtures.kline['5m']!;
    expect(baseBars.length).toBeGreaterThanOrEqual(210);
    const singleSessionDate = '2026-03-25';
    question.fixtures.kline['5m'] = baseBars.map((entry, index) => ({
      ...entry,
      time: timeAt(singleSessionDate, 570 + index),
    }));
    const audit = auditEpisodeQuestion(question);
    expect(audit.passed).toBe(false);
    expect(audit.checks.find((check) => check.id === 'initial-5m-count')).toMatchObject({
      status: 'pass',
    });
    expect(audit.checks.find((check) => check.id === '5m-session-span')).toMatchObject({
      status: 'fail',
      expected: 2,
      actual: 1,
    });
  });

  it('fails, naming the mid tier, when the mid window is short', () => {
    const question = fivePeriodFixture();
    question.fixtures.kline['15m'] = question.fixtures.kline['15m']!.slice(1);
    const audit = auditEpisodeQuestion(question);
    expect(audit.passed).toBe(false);
    expect(audit.checks.find((check) => check.id === 'initial-15m-count')).toMatchObject({
      status: 'fail',
    });
  });

  it('fails, naming the tier, when that tier is missing its rollups', () => {
    const question = fivePeriodFixture();
    expect(question.replay.rollups!['15m'].length).toBeGreaterThan(0);
    question.replay.rollups!['15m'] = [];
    const audit = auditEpisodeQuestion(question);
    expect(audit.passed).toBe(false);
    expect(audit.checks.find((check) => check.id === '15m-rollup-count')).toMatchObject({
      status: 'fail',
    });
  });

  it('fails the quote check when it disagrees with the base-folded day the producer built, on a ladder with no day tier', () => {
    const question = fivePeriodFixture();
    (question.fixtures.quote as Record<string, unknown>).last = 999_999;
    const audit = auditEpisodeQuestion(question);
    expect(audit.passed).toBe(false);
    expect(audit.checks.find((check) => check.id === 'quote')).toMatchObject({ status: 'fail' });
  });

  it('passes a well-formed 15m case audited with sources, exercising the folded mid tier / native top tier split', () => {
    const { question, sources } = fifteenPeriodFixture();
    const audit = auditEpisodeQuestion(question, sources);
    expect(audit.passed).toBe(true);
    expect(audit.checks.every((check) => check.status === 'pass')).toBe(true);
    expect(audit.checks.map((check) => check.id)).toEqual(
      expect.arrayContaining([
        'source-15m',
        'source-h1-history',
        'source-h1-rollups',
        'source-day',
        'partial-h1',
      ]),
    );
    expect(audit.checks.map((check) => check.id)).not.toContain('partial-day');
    expect(audit.checks.map((check) => check.id)).not.toContain('15m-session-span');
  });

  it('fails, naming the folded mid-tier source check, when the live 1h source disagrees with the fixture', () => {
    const { question, sources } = fifteenPeriodFixture();
    const cutoffBucketStart = periodBucketStart('1h', question.cutoff);
    const targetIndex = sources.dayBars.reduce(
      (lastIndex, entry, index) =>
        periodBucketStart('1h', entry.time) < cutoffBucketStart ? index : lastIndex,
      -1,
    );
    expect(targetIndex).toBeGreaterThanOrEqual(0);
    const corruptedDayBars = sources.dayBars.map((entry, index) =>
      index === targetIndex ? { ...entry, close: '9999' } : entry,
    );
    const audit = auditEpisodeQuestion(question, { ...sources, dayBars: corruptedDayBars });
    expect(audit.passed).toBe(false);
    expect(audit.checks.find((check) => check.id === 'source-h1-history')).toMatchObject({
      status: 'fail',
    });
  });
});
