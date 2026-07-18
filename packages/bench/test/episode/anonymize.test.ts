import { describe, expect, it } from 'vitest';
import type { QuoteBar } from '../../src/generate/assemble.js';
import { anonymizeEpisodeQuestion } from '../../src/episode/anonymize.js';
import { auditEpisodeQuestion } from '../../src/episode/audit.js';
import { assembleEpisodeQuestion, marketCloseIso, marketDate } from '../../src/episode/generate.js';

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
  const close = 80 + index / 10;
  return {
    time,
    open: close - 0.2,
    high: close + 0.5,
    low: close - 0.5,
    close,
    volume: 2_000_000 + index * 100,
    turnover: String((2_000_000 + index * 100) * close),
  };
}

function marketTime(date: string, time: string): string {
  const offset = marketCloseIso(date).slice(-6);
  return `${date}T${time}${offset}`;
}

function sourceQuestion(cutoff = '2024-03-27', horizonSessions = 4) {
  const hourDates = businessDates(
    dateOffset(cutoff, -60),
    dateOffset(cutoff, horizonSessions * 2 + 20),
  );
  const initial = hourDates.filter((date) => date <= cutoff).slice(-30);
  const future = hourDates.filter((date) => date > cutoff).slice(0, horizonSessions);
  const hourBars = [...initial, ...future].flatMap((date, dayIndex) =>
    Array.from({ length: 7 }, (_, hourIndex) =>
      bar(
        marketTime(date, `${String(9 + hourIndex).padStart(2, '0')}:30:00`),
        dayIndex * 7 + hourIndex,
      ),
    ),
  );
  const dayBars = businessDates(
    dateOffset(cutoff, -500),
    dateOffset(cutoff, horizonSessions * 2 + 20),
  ).map((date, index) => bar(`${date}T20:00:00Z`, index));
  const weekBars = Array.from({ length: 120 }, (_, index) =>
    bar(`${dateOffset(cutoff, (index - 120) * 7)}T20:00:00Z`, index),
  );
  const question = assembleEpisodeQuestion({
    symbol: 'MU.US',
    layer: 'high-vol-tech',
    cutoffDate: cutoff,
    hourBars,
    dayBars,
    weekBars,
    horizonSessions,
    calendar: { events: [{ date: '2024-04-01', content: 'source identity' }] },
  });
  question.fixtures.news = [
    {
      id: 'source-news',
      title: 'Micron source identity',
      published_at: '2024-03-26T12:00:00Z',
      url: 'https://example.com/micron',
    },
  ];
  question.fixtures.fundamentals = { company: 'Micron' };
  return question;
}

describe('blind episode anonymization', () => {
  it('removes identity and event fields while preserving market geometry', () => {
    const source = sourceQuestion();
    const { question, provenance } = anonymizeEpisodeQuestion(source, {
      alias: 'ASSET001',
      syntheticCutoff: '2026-03-25',
    });

    const serialized = JSON.stringify(question);
    expect(question.id).toBe('swing-ASSET001-2026-03-25-01');
    expect(question.symbol).toBe('ASSET001.SIM');
    expect(question.layer).toBe('anonymous');
    expect(question.fixtures.quote.last).toBeCloseTo(100, 6);
    expect(question.fixtures.news).toEqual([]);
    expect(question.fixtures.calendar).toEqual({});
    expect(question.fixtures.fundamentals).toEqual({});
    expect(serialized).not.toContain('MU.US');
    expect(serialized).not.toContain('2024-03-27');
    expect(serialized).not.toContain('Micron');
    expect(question.replay.bars.every((bar) => bar.time.includes('2026-'))).toBe(true);
    expect(auditEpisodeQuestion(question).passed).toBe(true);

    const sourceReturn = Number(source.replay.bars[0].close) / Number(source.fixtures.quote.last);
    const blindReturn =
      Number(question.replay.bars[0].close) / Number(question.fixtures.quote.last);
    expect(blindReturn).toBeCloseTo(sourceReturn, 6);
    expect(provenance).toMatchObject({ sourceSymbol: 'MU.US', aliasSymbol: 'ASSET001.SIM' });
  });

  it('preserves New York market hours across a shifted DST boundary', () => {
    const source = sourceQuestion('2023-02-02', 40);
    const { question } = anonymizeEpisodeQuestion(source, {
      alias: 'ASSET002',
      syntheticCutoff: '2026-02-05',
    });
    const firstPostDstBar = question.replay.bars.find(
      (item) => marketDate(item.time) === '2026-03-09',
    );

    expect(firstPostDstBar?.time).toBe('2026-03-09T13:30:00.000Z');
    const failedChecks = auditEpisodeQuestion(question)
      .checks.filter((check) => check.status === 'fail')
      .map((check) => check.id);
    expect(failedChecks).toEqual([]);
  });
});
