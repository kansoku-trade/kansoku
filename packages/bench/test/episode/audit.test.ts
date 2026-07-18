import { describe, expect, it } from 'vitest';
import type { QuoteBar } from '../../src/generate/assemble.js';
import { auditEpisodeQuestion } from '../../src/episode/audit.js';
import { assembleEpisodeQuestion } from '../../src/episode/generate.js';

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
});
