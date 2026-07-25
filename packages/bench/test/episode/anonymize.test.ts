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

function timeAt(date: string, minutesSinceMidnight: number): string {
  const hour = Math.floor(minutesSinceMidnight / 60);
  const minute = minutesSinceMidnight % 60;
  return `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-04:00`;
}

function sessionBars(date: string, minutes: number, startIndex: number): QuoteBar[] {
  const count = Math.ceil(390 / minutes);
  return Array.from({ length: count }, (_, i) => bar(timeAt(date, 570 + i * minutes), startIndex + i));
}

function intradayBarsForDates(dates: string[], minutes: number): QuoteBar[] {
  let index = 0;
  return dates.flatMap((date) => {
    const bars = sessionBars(date, minutes, index);
    index += bars.length;
    return bars;
  });
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
    expect(question.fixtures.kline['1h']!.at(-1)?.close).toBeCloseTo(100, 6);
    expect(question.fixtures.quote.last).toBeCloseTo(
      Number(source.fixtures.kline.day!.at(-1)!.close) * provenance.priceScale,
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

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
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
      'week': [
        rawBar('2024-01-15T20:00:00Z', 12345.678, 12345.678, 12345.678, 12345.678, 87654321),
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
      'week': [
        {
          availableAt: '2024-01-15T20:00:00Z',
          bar: rawBar('2024-01-15T20:00:00Z', 24681.357, 24681.357, 24681.357, 24681.357, 13579246),
        },
      ],
    },
  },
};

const FIFTEEN_MIN_DAY_SOURCE: Question = {
  id: 'swing-FMDAY-2024-03-27-01',
  bank: 'swing',
  symbol: 'ACME.US',
  cutoff: '2024-03-27T20:00:00Z',
  layer: 'high-vol-tech',
  adversarial: false,
  fixtures: {
    kline: {
      '15m': [rawBar('2024-03-27T19:45:00Z', 49.7, 50.2, 49.5, 50, 1000)],
      '1h': [
        rawBar('2024-03-27T13:30:00Z', 49, 49.6, 48.5, 49.4, 7000),
        rawBar('2024-03-27T19:30:00Z', 49.6, 50, 49.3, 49.7, 6500),
      ],
      'day': [
        rawBar('2024-03-26T20:00:00Z', 47, 47.5, 46.5, 47.2, 40000),
        rawBar('2024-03-27T20:00:00Z', 49, 51, 48, 50, 50000),
      ],
    },
    indicators: {},
    quote: { last: 50 },
    capitalFlow: {},
    news: [],
    fundamentals: {},
    calendar: {},
  },
  replay: {
    basePeriod: '15m',
    horizonBars: 1,
    bars: [rawBar('2024-03-28T13:30:00Z', 50.1, 50.5, 49.8, 50.3, 1200)],
  },
};

const STALE_MID_BUCKET_SOURCE: Question = {
  id: 'swing-STALEMID-2024-03-27-01',
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
        rawBar('2024-03-27T18:30:00Z', 49.6, 50, 49.3, 49.7, 3100),
        rawBar('2024-03-27T18:45:00Z', 49.7, 50.2, 49.5, 50, 3200),
      ],
      '1h': [
        rawBar('2024-03-27T13:30:00Z', 49, 49.6, 48.5, 49.4, 7000),
        rawBar('2024-03-27T18:30:00Z', 999, 999, 999, 999, 999),
      ],
    },
    indicators: {},
    quote: { last: 50 },
    capitalFlow: {},
    news: [],
    fundamentals: {},
    calendar: {},
  },
  replay: {
    basePeriod: '5m',
    horizonBars: 1,
    bars: [rawBar('2024-03-28T13:30:00Z', 50.1, 50.5, 49.8, 50.3, 1200)],
  },
};

const SINGLE_SESSION_SOURCE: Question = {
  id: 'swing-SINGLESESSION-2024-03-27-01',
  bank: 'swing',
  symbol: 'ACME.US',
  cutoff: '2024-03-27T20:00:00Z',
  layer: 'high-vol-tech',
  adversarial: false,
  fixtures: {
    kline: {
      '5m': [
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
    quote: { last: 50 },
    capitalFlow: {},
    news: [],
    fundamentals: {},
    calendar: {},
  },
  replay: {
    basePeriod: '5m',
    horizonBars: 1,
    bars: [rawBar('2024-03-28T13:30:00Z', 50.1, 50.5, 49.8, 50.3, 1200)],
  },
};

describe('blind episode anonymization — five-period ladder', () => {
  it('anonymises a 5m-based case without throwing, carries only the ladder tier keys, and drops the out-of-ladder week series without leaking its real data', () => {
    const { question } = anonymizeEpisodeQuestion(FIVE_MIN_SOURCE, {
      alias: 'ASSET003',
      syntheticCutoff: '2026-03-25',
    });

    expect(Object.keys(question.fixtures.kline).sort()).toEqual(
      [...episodePeriodLadder('5m')].sort(),
    );
    expect(question.fixtures.kline).not.toHaveProperty('day');
    expect(question.fixtures.kline).not.toHaveProperty('week');
    expect(Object.keys(question.replay.rollups ?? {}).sort()).toEqual(['15m', '1h'].sort());
    expect(question.replay.rollups).not.toHaveProperty('week');
    expect(Value.Check(questionSchema, question)).toBe(true);

    const serialized = JSON.stringify(question);
    expect(serialized).not.toContain('2024-01-15');
    expect(serialized).not.toContain('12345.678');
    expect(serialized).not.toContain('87654321');
    expect(serialized).not.toContain('24681.357');
    expect(serialized).not.toContain('13579246');
  });

  it('derives a well-formed per-trading-day quote when the ladder has no day tier, with the cutoff close landing at 100', () => {
    const { question, provenance } = anonymizeEpisodeQuestion(FIVE_MIN_SOURCE, {
      alias: 'ASSET004',
      syntheticCutoff: '2026-03-25',
    });

    expect(question.fixtures.kline['5m']!.at(-1)?.close).toBeCloseTo(100, 6);
    expect(question.fixtures.quote.last).toBeCloseTo(100, 6);
    expect(question.fixtures.quote.open).toBeCloseTo(98, 6);
    expect(question.fixtures.quote.high).toBeCloseTo(100.4, 6);
    expect(question.fixtures.quote.low).toBeCloseTo(97, 6);
    expect(question.fixtures.quote.prev_close).toBeCloseTo(96.8, 6);
    expect(question.fixtures.quote.volume).toBeCloseTo(4300 * provenance.volumeScale, 3);

    const baseVolumes = question.fixtures.kline['5m']!.map((entry) => Number(entry.volume));
    expect(median(baseVolumes)).toBeCloseTo(1_000_000, 3);
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

    const rebuiltHour = question.fixtures.kline['1h']!.at(-1)!;
    const scale = provenance.priceScale;
    expect(question.fixtures.kline['1h']).toHaveLength(2);
    expect(rebuiltHour.open).toBeCloseTo(49.6 * scale, 6);
    expect(rebuiltHour.high).toBeCloseTo(50.2 * scale, 6);
    expect(rebuiltHour.low).toBeCloseTo(49.3 * scale, 6);
    expect(rebuiltHour.close).toBeCloseTo(50 * scale, 6);
    expect(rebuiltHour.volume).toBeCloseTo((3100 + 3200) * provenance.volumeScale, 3);
  });

  it('rebuilds the top-tier bucket containing the last mid-tier bar even when that bucket is not the market-close bucket', () => {
    const { question, provenance } = anonymizeEpisodeQuestion(STALE_MID_BUCKET_SOURCE, {
      alias: 'ASSET007',
      syntheticCutoff: '2026-03-25',
    });

    const rebuiltHour = question.fixtures.kline['1h']!.at(-1)!;
    const scale = provenance.priceScale;
    expect(question.fixtures.kline['1h']).toHaveLength(2);
    expect(rebuiltHour.open).toBeCloseTo(49.6 * scale, 6);
    expect(rebuiltHour.high).toBeCloseTo(50.2 * scale, 6);
    expect(rebuiltHour.low).toBeCloseTo(49.3 * scale, 6);
    expect(rebuiltHour.close).toBeCloseTo(50 * scale, 6);
    expect(rebuiltHour.volume).toBeCloseTo((3100 + 3200) * provenance.volumeScale, 3);
  });

  it('rejects a source whose base bars fold to a single trading session, naming the ladder and what was found', () => {
    expect(() =>
      anonymizeEpisodeQuestion(SINGLE_SESSION_SOURCE, {
        alias: 'ASSET009',
        syntheticCutoff: '2026-03-25',
      }),
    ).toThrow('insufficient 5m history for a stable blind quote: need 2 trading days, got 1');
  });
});

describe('blind episode anonymization — day-tier top period (15m ladder)', () => {
  it('keeps the native cutoff-day bar as-is instead of folding it from 1h bars', () => {
    const { question, provenance } = anonymizeEpisodeQuestion(FIFTEEN_MIN_DAY_SOURCE, {
      alias: 'ASSET010',
      syntheticCutoff: '2026-03-25',
    });

    const scale = provenance.priceScale;
    const cutoffDayBar = question.fixtures.kline.day!.at(-1)!;
    expect(question.fixtures.kline.day).toHaveLength(2);
    expect(cutoffDayBar.open).toBeCloseTo(49 * scale, 6);
    expect(cutoffDayBar.high).toBeCloseTo(51 * scale, 6);
    expect(cutoffDayBar.low).toBeCloseTo(48 * scale, 6);
    expect(cutoffDayBar.close).toBeCloseTo(50 * scale, 6);
    expect(cutoffDayBar.volume).toBeCloseTo(50000 * provenance.volumeScale, 3);

    expect(question.fixtures.quote.high).toBeCloseTo(51 * scale, 6);
    expect(question.fixtures.quote.low).toBeCloseTo(48 * scale, 6);
    expect(question.fixtures.quote.last).toBeCloseTo(50 * scale, 6);
    expect(question.fixtures.quote.volume).toBeCloseTo(50000 * provenance.volumeScale, 3);

    const quoteCheck = auditEpisodeQuestion(question).checks.find((check) => check.id === 'quote');
    expect(quoteCheck?.status).toBe('pass');
  });
});

describe('blind episode anonymization — 1m ladder quote consistency', () => {
  it('produces a blind quote that is the transform of the live 1m quote, with a stable prev_close and scaled turnover on both sides', () => {
    const cutoffDate = '2026-03-25';
    const pastDates = businessDates(dateOffset(cutoffDate, -20), cutoffDate);
    const futureDates = businessDates(dateOffset(cutoffDate, 1), dateOffset(cutoffDate, 20)).slice(0, 4);
    const allDates = [...pastDates, ...futureDates];

    const source = assembleEpisodeQuestion({
      symbol: 'MRVL.US',
      layer: 'high-vol-tech',
      cutoffDate,
      basePeriod: '1m',
      baseBars: intradayBarsForDates(allDates, 1),
      midBars: intradayBarsForDates(allDates, 5),
      topBars: intradayBarsForDates(allDates, 15),
      horizonSessions: 4,
      calendar: {},
    });

    const sourceQuote = source.fixtures.quote as Record<string, unknown>;
    expect(sourceQuote.prev_close).not.toBeNull();
    expect(sourceQuote.turnover).not.toBeNull();

    const { question, provenance } = anonymizeEpisodeQuestion(source, {
      alias: 'ASSET008',
      syntheticCutoff: dateOffset(cutoffDate, 7),
    });
    const blindQuote = question.fixtures.quote as Record<string, unknown>;

    expect(Number(blindQuote.last)).toBeCloseTo(Number(sourceQuote.last) * provenance.priceScale, 6);
    expect(Number(blindQuote.open)).toBeCloseTo(Number(sourceQuote.open) * provenance.priceScale, 6);
    expect(Number(blindQuote.high)).toBeCloseTo(Number(sourceQuote.high) * provenance.priceScale, 6);
    expect(Number(blindQuote.low)).toBeCloseTo(Number(sourceQuote.low) * provenance.priceScale, 6);
    expect(Number(blindQuote.prev_close)).toBeCloseTo(
      Number(sourceQuote.prev_close) * provenance.priceScale,
      6,
    );
    expect(Number(blindQuote.volume)).toBeCloseTo(
      Number(sourceQuote.volume) * provenance.volumeScale,
      3,
    );
    expect(Number(blindQuote.turnover)).toBeCloseTo(
      Number(sourceQuote.turnover) * provenance.priceScale * provenance.volumeScale,
      3,
    );
  });
});

const EPILOGUE_BARS: RawBar[] = [
  rawBar('2024-03-28T13:40:00Z', 50.4, 50.9, 50.1, 50.7, 800),
  rawBar('2024-03-28T13:45:00Z', 50.7, 50.8, 39, 39.5, 100000),
];

const EPILOGUE_LEAK_CANARY_BARS: RawBar[] = [
  rawBar('2024-03-28T13:40:00Z', 50.4, 50.9, 50.1, 50.7, 800),
  rawBar('2099-01-01T00:00:00Z', 918273.645, 918273.645, 918273.645, 918273.645, 837465921),
];

describe('blind episode anonymization — epilogue', () => {
  it('omits the epilogue field entirely when no epilogue bars are supplied', () => {
    const result = anonymizeEpisodeQuestion(FIVE_MIN_SOURCE, {
      alias: 'ASSET011',
      syntheticCutoff: '2026-03-25',
    });

    expect(result).not.toHaveProperty('epilogue');
  });

  it('returns byte-identical question and provenance whether or not the epilogue argument is passed', () => {
    const transform = { alias: 'ASSET012', syntheticCutoff: '2026-03-25' };
    const withoutThirdArg = anonymizeEpisodeQuestion(FIVE_MIN_SOURCE, transform);
    const withUndefinedEpilogue = anonymizeEpisodeQuestion(FIVE_MIN_SOURCE, transform, undefined);

    expect(withUndefinedEpilogue).not.toHaveProperty('epilogue');
    expect(JSON.stringify(withUndefinedEpilogue)).toBe(JSON.stringify(withoutThirdArg));
  });

  it("scales the epilogue with the case's own price/volume scale, continuing the last case bar without a jump at the boundary", () => {
    const { question, provenance, epilogue } = anonymizeEpisodeQuestion(
      FIVE_MIN_SOURCE,
      { alias: 'ASSET013', syntheticCutoff: '2026-03-25' },
      EPILOGUE_BARS,
    );

    expect(epilogue).toHaveLength(2);
    const lastCaseBar = question.replay.bars.at(-1)!;
    expect(Number(epilogue![0].open)).toBeCloseTo(Number(lastCaseBar.close), 6);
    expect(Number(epilogue![0].open)).toBeCloseTo(50.4 * provenance.priceScale, 6);
    expect(Number(epilogue![0].volume)).toBeCloseTo(800 * provenance.volumeScale, 3);
    expect(Number(epilogue![1].close)).toBeCloseTo(39.5 * provenance.priceScale, 6);

    // If the epilogue were rescaled from its own data (last close 39.5) rather than the
    // case's own scale, this same bar would land near 50.4 * (100 / 39.5) ≈ 127.6, not 100.8.
    const independentlyScaledOpen = 50.4 * (100 / 39.5);
    expect(Number(epilogue![0].open)).not.toBeCloseTo(independentlyScaledOpen, 0);
  });

  it("rejects an epilogue that does not start strictly after the case's last bar", () => {
    const nonAdjacentEpilogue: RawBar[] = [
      rawBar('2024-03-28T13:35:00Z', 50.4, 50.9, 50.1, 50.7, 800),
    ];

    expect(() =>
      anonymizeEpisodeQuestion(
        FIVE_MIN_SOURCE,
        { alias: 'ASSET017', syntheticCutoff: '2026-03-25' },
        nonAdjacentEpilogue,
      ),
    ).toThrow("blind epilogue must start strictly after the case's last bar");
  });

  it('rejects an epilogue whose own bars are not strictly increasing in time', () => {
    const outOfOrderEpilogue: RawBar[] = [
      rawBar('2024-03-28T13:45:00Z', 50.7, 50.8, 39, 39.5, 100000),
      rawBar('2024-03-28T13:40:00Z', 50.4, 50.9, 50.1, 50.7, 800),
    ];

    expect(() =>
      anonymizeEpisodeQuestion(
        FIVE_MIN_SOURCE,
        { alias: 'ASSET018', syntheticCutoff: '2026-03-25' },
        outOfOrderEpilogue,
      ),
    ).toThrow('blind epilogue bars must be strictly increasing in time');
  });

  it('shifts the epilogue bars by the same dayShift as the case body', () => {
    const { provenance, epilogue } = anonymizeEpisodeQuestion(
      FIVE_MIN_SOURCE,
      { alias: 'ASSET014', syntheticCutoff: '2026-03-25' },
      EPILOGUE_BARS,
    );

    expect(provenance.dayShift).toBe(728);
    expect(epilogue![0].time).toBe('2026-03-26T13:40:00.000Z');
  });

  it('keeps the epilogue out of the returned question and carries no recognisable real timestamp or price into either output', () => {
    const { question, epilogue } = anonymizeEpisodeQuestion(
      FIVE_MIN_SOURCE,
      { alias: 'ASSET015', syntheticCutoff: '2026-03-25' },
      EPILOGUE_LEAK_CANARY_BARS,
    );

    expect(question).not.toHaveProperty('epilogue');
    const serializedQuestion = JSON.stringify(question);
    const serializedEpilogue = JSON.stringify(epilogue);
    for (const needle of ['2099-01-01', '918273.645', '837465921']) {
      expect(serializedQuestion).not.toContain(needle);
      expect(serializedEpilogue).not.toContain(needle);
    }
  });
});
