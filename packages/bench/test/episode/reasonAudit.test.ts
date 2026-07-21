import { describe, expect, it } from 'vitest';
import { auditEpisodeReasons } from '../../src/episode/reasonAudit.js';
import type { EpisodeActionRecord } from '../../src/schema/episode.js';
import type { Question } from '../../src/schema/question.js';

function bar(time: string, open: number, high: number, low: number, close: number) {
  return { time, open, high, low, close, volume: 1_000 };
}

const REPLAY = [
  bar('2026-03-23T14:30:00Z', 100, 103, 99, 102),
  bar('2026-03-23T15:30:00Z', 102, 105, 101, 104),
  bar('2026-03-23T16:30:00Z', 104, 106, 103, 105),
];

function question(): Question {
  return {
    id: 'swing-TEST-01',
    bank: 'swing',
    symbol: 'MU.US',
    cutoff: '2026-03-20T20:00:00-04:00',
    layer: 'high-vol-tech',
    adversarial: false,
    fixtures: {
      kline: { '1h': [bar('2026-03-20T19:30:00Z', 99, 101, 98, 100)], day: [], week: [] },
      indicators: {},
      quote: { last: 100 },
      capitalFlow: {},
      news: [],
      fundamentals: {},
      calendar: {},
    },
    replay: { basePeriod: '1h', entryExpiryBars: 3, horizonBars: REPLAY.length, bars: REPLAY },
  };
}

function record(step: number, at: string, summary: string): EpisodeActionRecord {
  return {
    step,
    at,
    effectiveBarTime: null,
    action: { type: 'hold', reason: { category: 'trend_following', summary } },
  } as EpisodeActionRecord;
}

describe('auditEpisodeReasons', () => {
  it('accepts a price that traded inside the visible window', () => {
    const audit = auditEpisodeReasons(question(), [
      record(1, REPLAY[1].time, '价格回踩 101.50 后企稳，结构未破。'),
    ]);
    expect(audit.priceCitations).toBe(1);
    expect(audit.findings).toHaveLength(0);
  });

  it('flags a price the tape never printed', () => {
    const audit = auditEpisodeReasons(question(), [
      record(1, REPLAY[0].time, '在 97.20 获得支撑，反弹确认。'),
    ]);
    expect(audit.findings).toEqual([
      expect.objectContaining({ kind: 'impossible_price', cited: 97.2, step: 1 }),
    ]);
  });

  it('flags a bar index the model has not been shown', () => {
    const audit = auditEpisodeReasons(question(), [
      record(1, REPLAY[0].time, 'B57 跳空跌破前低，趋势反转。'),
    ]);
    expect(audit.findings).toEqual([
      expect.objectContaining({ kind: 'future_bar', cited: 57, step: 1 }),
    ]);
  });

  it('leaves R multiples, percentages, counts and dates unaudited', () => {
    const audit = auditEpisodeReasons(question(), [
      record(
        1,
        REPLAY[2].time,
        '本笔亏损 1.50R，回撤 3.20%，持有 2.00 根，20 日均线走平，参考 2026-03-13 低点。',
      ),
    ]);
    expect(audit.findings).toHaveLength(0);
    expect(audit.priceCitations).toBe(0);
  });

  it('counts reasons that carry no checkable citation at all', () => {
    const audit = auditEpisodeReasons(question(), [
      record(1, REPLAY[0].time, '继续观察，等待更好的机会。'),
      record(2, REPLAY[1].time, '价格在 104.00 遇阻。'),
    ]);
    expect(audit.reasons).toBe(2);
    expect(audit.reasonsWithCitation).toBe(1);
  });
});
