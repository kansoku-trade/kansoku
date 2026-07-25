import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { QuoteBar } from '../../src/generate/assemble.js';
import type { EpisodeKlinePeriod } from '../../src/generate/source.js';
import { loadQuestionForScorer } from '../../src/dataset/loader.js';
import { assertEpisodeDatasetPlan } from '../../src/episode/datasetPlan.js';
import { buildEpisodeDataset, finalizeEpisodeDataset } from '../../src/episode/dataset.js';

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

function hourBarsForCutoff(cutoff: string, futureSessions: number): QuoteBar[] {
  const dates = businessDates(dateOffset(cutoff, -60), dateOffset(cutoff, 20));
  const initial = dates.filter((date) => date <= cutoff).slice(-30);
  const future = dates.filter((date) => date > cutoff).slice(0, futureSessions);
  return [...initial, ...future].flatMap((date, dateIndex) =>
    Array.from({ length: 7 }, (_, hourIndex) => {
      const hour = String(9 + hourIndex).padStart(2, '0');
      return bar(`${date}T${hour}:30:00-04:00`, dateIndex * 7 + hourIndex);
    }),
  );
}

function dailyBars(cutoff: string): QuoteBar[] {
  return businessDates(dateOffset(cutoff, -500), dateOffset(cutoff, 20)).map((date, index) =>
    bar(`${date}T20:00:00Z`, index),
  );
}

function weeklyBars(cutoff: string): QuoteBar[] {
  return Array.from({ length: 120 }, (_, index) =>
    bar(`${dateOffset(cutoff, (index - 120) * 7)}T20:00:00Z`, index),
  );
}

async function runBuild(
  cohort: 'live-2026',
  cutoffDate: string,
  basePeriod: '1m' | '5m' | '15m' | '30m' | '1h' | undefined,
  barsByPeriod: Partial<Record<EpisodeKlinePeriod, QuoteBar[]>>,
) {
  const plan = assertEpisodeDatasetPlan({
    schemaVersion: 1,
    id: `test-${basePeriod ?? 'default'}-${Math.random().toString(36).slice(2)}`,
    cohort,
    ...(basePeriod ? { basePeriod } : {}),
    horizonSessions: 5,
    cases: [{ symbol: 'MU.US', cutoff: cutoffDate }],
  });

  const fetchKlineHistory = async (
    _symbol: string,
    period: EpisodeKlinePeriod,
    _start: string,
    _end: string,
  ): Promise<QuoteBar[]> => barsByPeriod[period] ?? [];

  const datasetsRoot = mkdtempSync(join(tmpdir(), 'bench-dataset-'));
  const sourceCacheRoot = mkdtempSync(join(tmpdir(), 'bench-dataset-cache-'));

  await buildEpisodeDataset({ plan, datasetsRoot, sourceCacheRoot, fetchKlineHistory });
  const quality = await finalizeEpisodeDataset(plan, datasetsRoot);
  const question = await loadQuestionForScorer(
    datasetsRoot,
    plan.id,
    'swing',
    quality.cases[0].questionId,
  );
  return { plan, quality, question };
}

describe('buildEpisodeDataset basePeriod threading', () => {
  it('defaults to the 1h/day/week ladder when the plan omits basePeriod', async () => {
    const cutoffDate = '2026-03-25';
    const { plan, quality, question } = await runBuild('live-2026', cutoffDate, undefined, {
      '1h': hourBarsForCutoff(cutoffDate, 10),
      day: dailyBars(cutoffDate),
      week: weeklyBars(cutoffDate),
    });

    expect(plan.basePeriod).toBeUndefined();
    expect(quality.passed).toBe(true);
    expect(question.replay.basePeriod).toBe('1h');
    expect(question.fixtures.kline['1h']).toBeDefined();
    expect(question.fixtures.kline.day).toBeDefined();
    expect(question.fixtures.kline.week).toBeDefined();
  });

  it('threads a plan-level basePeriod: 5m through to the assembled 5m/15m/1h ladder', async () => {
    const cutoffDate = '2026-03-25';
    const pastDates = businessDates(dateOffset(cutoffDate, -60), cutoffDate);
    const futureDates = businessDates(dateOffset(cutoffDate, 1), dateOffset(cutoffDate, 20)).slice(
      0,
      10,
    );
    const allDates = [...pastDates, ...futureDates];

    const { plan, quality, question } = await runBuild('live-2026', cutoffDate, '5m', {
      '5m': intradayBarsForDates(allDates, 5),
      '15m': intradayBarsForDates(allDates, 15),
      '1h': intradayBarsForDates(allDates, 60),
    });

    expect(plan.basePeriod).toBe('5m');
    expect(quality.passed).toBe(true);
    expect(question.replay.basePeriod).toBe('5m');
    expect(question.fixtures.kline['5m']).toBeDefined();
    expect(question.fixtures.kline['15m']).toBeDefined();
    expect(question.fixtures.kline['1h']).toBeDefined();
    expect(question.fixtures.kline.day).toBeUndefined();
    expect(question.fixtures.kline.week).toBeUndefined();
  });
});
