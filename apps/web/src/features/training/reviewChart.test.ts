import { describe, expect, it } from 'vitest';
import type { TrainerClosedTrade, TrainerReviewPayload } from '@kansoku/pro-api';
import type { RawBar } from '@kansoku/shared/types';
import { reviewBands, reviewSeries, reviewTrades } from './reviewChart';

function bar(iso: string, close: number): RawBar {
  return { time: iso, open: close - 1, high: close + 1, low: close - 1.5, close, volume: 1000 };
}

const LOOKBACK = [bar('2026-01-05T13:50:00.000Z', 98), bar('2026-01-05T13:55:00.000Z', 99)];
const REPLAY = [
  bar('2026-01-05T14:00:00.000Z', 100),
  bar('2026-01-05T14:05:00.000Z', 101),
  bar('2026-01-05T14:10:00.000Z', 102),
  bar('2026-01-05T14:15:00.000Z', 103),
  bar('2026-01-05T14:20:00.000Z', 104),
];
const EPILOGUE = [bar('2026-01-05T14:25:00.000Z', 106), bar('2026-01-05T14:30:00.000Z', 108)];

function trade(entryTime: string, exitTime: string, tradeId = 1): TrainerClosedTrade {
  return {
    tradeId,
    direction: 'long',
    decisionBar: 0,
    decisionTime: entryTime,
    entry: { time: entryTime, price: 100 },
    exit: { time: exitTime, price: 103 },
    exitReason: 'target',
    initialStop: 98,
    finalStop: 98,
    target: 103,
    initialRisk: 2,
    grossR: 1.5,
    frictionR: 0,
    netR: 1.5,
    mfeR: 1.5,
    maeR: 0,
    holdingBars: 3,
  };
}

function payload(overrides: Partial<TrainerReviewPayload> = {}): TrainerReviewPayload {
  return {
    sessionId: 'run-1',
    caseId: 'case-1',
    symbol: 'TRAIN01',
    basePeriod: '5m',
    ladder: ['5m', '15m', '1h'],
    provenance: {
      outputId: 'case-1',
      aliasSymbol: 'TRAIN01',
      sourceId: 'src-1',
      sourceSymbol: 'REALCANARY.US',
      sourceCutoff: '2019-04-01T20:00:00.000Z',
      syntheticCutoff: '2026-01-05T13:55:00.000Z',
      dayShift: 1064,
      priceScale: 0.1,
      volumeScale: 7,
    },
    tag: 'false-breakout',
    lookback: LOOKBACK,
    replay: REPLAY,
    epilogue: EPILOGUE,
    playedThrough: 2,
    trades: [trade('2026-01-05T14:00:00.000Z', '2026-01-05T14:10:00.000Z')],
    result: null,
    events: [],
    coach: [],
    facts: {
      stopAutopsy: null,
      holdToEpilogueEndR: null,
      afterExitHighR: null,
      afterExitLowR: null,
    },
    lesson: null,
    ...overrides,
  };
}

describe('reviewSeries', () => {
  it('stops at the brush so the chart comes back to what was on screen then', () => {
    const bars = reviewSeries(payload(), 1, true);

    expect(bars.map((b) => b.time)).toEqual([
      LOOKBACK[0].time,
      LOOKBACK[1].time,
      REPLAY[0].time,
      REPLAY[1].time,
    ]);
  });

  it('joins the epilogue only when the brush is parked at the end', () => {
    expect(reviewSeries(payload(), 4, true).at(-1)!.time).toBe(EPILOGUE[1].time);
    expect(reviewSeries(payload(), 3, true).at(-1)!.time).toBe(REPLAY[3].time);
  });

  it('leaves the epilogue off when the toggle is off', () => {
    expect(reviewSeries(payload(), 4, false).at(-1)!.time).toBe(REPLAY[4].time);
  });
});

describe('reviewTrades', () => {
  it('hides a trade that had not been entered yet at the brush position', () => {
    expect(reviewTrades(payload(), 0)).toHaveLength(1);
    expect(
      reviewTrades(
        payload({ trades: [trade('2026-01-05T14:15:00.000Z', '2026-01-05T14:20:00.000Z')] }),
        1,
      ),
    ).toEqual([]);
  });
});

describe('reviewBands', () => {
  it('separates what was handed over, what was played, and what was never reached', () => {
    const kinds = reviewBands(payload(), 4, false).map((band) => band.kind);

    expect(kinds).toEqual(['given', 'played', 'fog']);
  });

  it('drops the fog band once the brush is back inside the played run', () => {
    expect(reviewBands(payload(), 2, false).map((band) => band.kind)).toEqual(['given', 'played']);
  });

  it('adds the epilogue band only with the brush at the end and the toggle on', () => {
    expect(reviewBands(payload(), 4, true).map((band) => band.kind)).toContain('epilogue');
    expect(reviewBands(payload(), 3, true).map((band) => band.kind)).not.toContain('epilogue');
  });

  it('leaves the given band left-unbounded so older history is covered too', () => {
    const given = reviewBands(payload(), 4, false)[0];

    expect(given.startTime).toBe(0);
    expect(given.endTime).toBe(Math.floor(Date.parse(LOOKBACK[1].time) / 1000));
  });
});
