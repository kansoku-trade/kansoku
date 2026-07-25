import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';
import type { RawBar } from '@kansoku/shared/types';
import type { QuoteBar } from '../../src/generate/assemble.js';
import { anonymizeEpisodeQuestion } from '../../src/episode/anonymize.js';
import { auditEpisodeQuestion } from '../../src/episode/audit.js';
import { assembleEpisodeQuestion, marketCloseIso, marketDate } from '../../src/episode/generate.js';
import { episodePeriodLadder } from '../../src/episode/periods.js';
import { questionSchema, type Question } from '../../src/schema/question.js';

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
    expect(question.fixtures.kline['1h'].at(-1)?.close).toBeCloseTo(100, 6);
    expect(question.fixtures.quote.last).toBeCloseTo(
      Number(source.fixtures.kline.day.at(-1)!.close) * provenance.priceScale,
      6,
    );
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

function rawBar(
  time: string,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
): RawBar {
  return { time, open, high, low, close, volume };
}

const FIVE_MIN_SOURCE: Question = {
  id: 'swing-FMSRC-2024-03-27-01',
  bank: 'swing',
  symbol: 'ACME.US',
  cutoff: '2024-03-27T20:00:00Z',
  layer: 'high-vol-tech',
  adversarial: false,
  fixtures: {
    kline: {
      '5m': [
        rawBar('2024-03-26T13:30:00Z', 48, 48.5, 47.5, 48.2, 900),
        rawBar('2024-03-26T13:35:00Z', 48.2, 48.6, 47.8, 48.4, 950),
        rawBar('2024-03-27T13:30:00Z', 49, 49.5, 48.5, 49.2, 1000),
        rawBar('2024-03-27T13:35:00Z', 49.2, 49.7, 48.9, 49.5, 1050),
        rawBar('2024-03-27T19:30:00Z', 49.6, 50, 49.3, 49.7, 1100),
        rawBar('2024-03-27T19:45:00Z', 49.7, 50.2, 49.5, 50, 1150),
      ],
      '15m': [
        rawBar('2024-03-27T13:30:00Z', 49, 49.6, 48.5, 49.4, 3000),
        rawBar('2024-03-27T19:30:00Z', 49.6, 50, 49.3, 49.7, 3100),
        rawBar('2024-03-27T19:45:00Z', 49.7, 50.2, 49.5, 50, 3200),
      ],
      '1h': [
        rawBar('2024-03-27T13:30:00Z', 49, 49.6, 48.5, 49.4, 7000),
        rawBar('2024-03-27T19:30:00Z', 999, 999, 999, 999, 999),
      ],
    },
    indicators: {},
    quote: { last: 50, turnover: '250000' },
    capitalFlow: {},
    news: [],
    fundamentals: {},
    calendar: {},
  },
  replay: {
    basePeriod: '5m',
    horizonBars: 2,
    bars: [
      rawBar('2024-03-28T13:30:00Z', 50.1, 50.5, 49.8, 50.3, 1200),
      rawBar('2024-03-28T13:35:00Z', 50.3, 50.6, 50, 50.4, 1250),
    ],
    rollups: {
      '15m': [
        {
          availableAt: '2024-03-28T13:35:00Z',
          bar: rawBar('2024-03-27T19:45:00Z', 49.7, 50.25, 49.5, 50.05, 3250),
        },
      ],
      '1h': [
        {
          availableAt: '2024-03-28T13:35:00Z',
          bar: rawBar('2024-03-27T19:30:00Z', 49.6, 50.25, 49.3, 50.05, 6500),
        },
      ],
    },
  },
};

describe('blind episode anonymization — five-period ladder', () => {
  it('anonymises a 5m-based case without throwing and carries the ladder tier keys', () => {
    const { question } = anonymizeEpisodeQuestion(FIVE_MIN_SOURCE, {
      alias: 'ASSET003',
      syntheticCutoff: '2026-03-25',
    });

    expect(Object.keys(question.fixtures.kline).sort()).toEqual(
      [...episodePeriodLadder('5m')].sort(),
    );
    expect(question.fixtures.kline).not.toHaveProperty('day');
    expect(question.fixtures.kline).not.toHaveProperty('week');
    expect(Value.Check(questionSchema, question)).toBe(true);
  });

  it('derives a well-formed per-trading-day quote when the ladder has no day tier, with the cutoff close landing at 100', () => {
    const { question, provenance } = anonymizeEpisodeQuestion(FIVE_MIN_SOURCE, {
      alias: 'ASSET004',
      syntheticCutoff: '2026-03-25',
    });

    expect(question.fixtures.kline['5m'].at(-1)?.close).toBeCloseTo(100, 6);
    expect(question.fixtures.quote.last).toBeCloseTo(100, 6);
    expect(question.fixtures.quote.open).toBeCloseTo(98, 6);
    expect(question.fixtures.quote.high).toBeCloseTo(100.4, 6);
    expect(question.fixtures.quote.low).toBeCloseTo(97, 6);
    expect(question.fixtures.quote.prev_close).toBeCloseTo(96.8, 6);
    expect(question.fixtures.quote.volume).toBeCloseTo(4300 * provenance.volumeScale, 3);
  });

  it("shifts rollup availableAt consistently with bar timestamps for the ladder's mid/top tiers", () => {
    const { question, provenance } = anonymizeEpisodeQuestion(FIVE_MIN_SOURCE, {
      alias: 'ASSET005',
      syntheticCutoff: '2026-03-25',
    });

    expect(question.replay.rollups).toBeDefined();
    for (const period of ['15m', '1h'] as const) {
      const sourceEntries = FIVE_MIN_SOURCE.replay.rollups![period];
      const outputEntries = question.replay.rollups![period];
      expect(outputEntries).toHaveLength(sourceEntries.length);
      sourceEntries.forEach((sourceEntry, index) => {
        const outputEntry = outputEntries[index];
        const expectedDate = dateOffset(marketDate(sourceEntry.availableAt), provenance.dayShift);
        expect(marketDate(outputEntry.availableAt)).toBe(expectedDate);
        expect(Number(outputEntry.bar.close)).toBeCloseTo(
          Number(sourceEntry.bar.close) * provenance.priceScale,
          6,
        );
        expect(Number(outputEntry.bar.volume)).toBeCloseTo(
          Number(sourceEntry.bar.volume) * provenance.volumeScale,
          6,
        );
      });
    }
  });

  it("rebuilds the cutoff top-tier (1h) bar from that bucket's mid-tier (15m) bars instead of keeping the stale fixture bar", () => {
    const { question, provenance } = anonymizeEpisodeQuestion(FIVE_MIN_SOURCE, {
      alias: 'ASSET006',
      syntheticCutoff: '2026-03-25',
    });

    const rebuiltHour = question.fixtures.kline['1h'].at(-1)!;
    const scale = provenance.priceScale;
    expect(question.fixtures.kline['1h']).toHaveLength(2);
    expect(rebuiltHour.open).toBeCloseTo(49.6 * scale, 6);
    expect(rebuiltHour.high).toBeCloseTo(50.2 * scale, 6);
    expect(rebuiltHour.low).toBeCloseTo(49.3 * scale, 6);
    expect(rebuiltHour.close).toBeCloseTo(50 * scale, 6);
    expect(rebuiltHour.volume).toBeCloseTo((3100 + 3200) * provenance.volumeScale, 3);
  });
});
