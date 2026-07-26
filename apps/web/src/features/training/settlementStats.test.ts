import { describe, expect, it } from 'vitest';
import type { TrainerClosedTrade, TrainerResult } from '@kansoku/pro-api';
import {
  mfeGivebackR,
  plannedRewardRisk,
  settlementSummary,
  settlementTradeRows,
} from './settlementStats';

function trade(overrides: Partial<TrainerClosedTrade> = {}): TrainerClosedTrade {
  return {
    tradeId: 1,
    direction: 'long',
    decisionBar: 0,
    decisionTime: '2026-01-05T14:00:00.000Z',
    entry: { time: '2026-01-05T14:00:00.000Z', price: 100 },
    exit: { time: '2026-01-05T15:00:00.000Z', price: 103 },
    exitReason: 'target',
    initialStop: 98,
    finalStop: 98,
    target: 106,
    initialRisk: 2,
    grossR: 1.5,
    frictionR: 0.1,
    netR: 1.4,
    mfeR: 2.2,
    maeR: 0,
    holdingBars: 5,
    ...overrides,
  };
}

describe('plannedRewardRisk', () => {
  it('is target distance over initial risk, not the eventual exit', () => {
    expect(
      plannedRewardRisk(trade({ target: 106, entry: { time: '', price: 100 }, initialRisk: 2 })),
    ).toBe(3);
  });

  it('returns null when initial risk is zero or negative (no meaningful ratio)', () => {
    expect(plannedRewardRisk(trade({ initialRisk: 0 }))).toBeNull();
  });
});

describe('mfeGivebackR', () => {
  it('is the gap between the best point reached and what was actually banked', () => {
    expect(mfeGivebackR(trade({ mfeR: 2.2, netR: 1.4 }))).toBeCloseTo(0.8, 6);
  });

  it('floors at zero rather than going negative', () => {
    expect(mfeGivebackR(trade({ mfeR: 1, netR: 1.4 }))).toBe(0);
  });
});

describe('settlementTradeRows', () => {
  it('maps each closed trade to its own row, in order', () => {
    const trades = [
      trade({ tradeId: 1, netR: 1.4, mfeR: 2.2 }),
      trade({
        tradeId: 2,
        direction: 'short',
        netR: -1,
        mfeR: 0.5,
        entry: { time: '', price: 100 },
        target: 94,
        initialRisk: 2,
      }),
    ];
    const rows = settlementTradeRows(trades);
    expect(rows).toHaveLength(2);
    expect(rows[0].tradeId).toBe(1);
    expect(rows[0].direction).toBe('long');
    expect(rows[0].entryPrice).toBe(100);
    expect(rows[0].exitPrice).toBe(103);
    expect(rows[0].exitReason).toBe('target');
    expect(rows[0].plannedRewardRisk).toBe(3);
    expect(rows[0].netR).toBe(1.4);
    expect(rows[0].mfeGivebackR).toBeCloseTo(0.8, 6);
    expect(rows[1].direction).toBe('short');
    expect(rows[1].plannedRewardRisk).toBe(3);
    expect(rows[1].mfeGivebackR).toBeCloseTo(1.5, 6);
  });

  it('returns an empty array for a session with no trades', () => {
    expect(settlementTradeRows([])).toEqual([]);
  });
});

describe('settlementSummary', () => {
  const result: TrainerResult = {
    terminationReason: 'horizon',
    direction: 'long',
    entry: { time: '2026-01-05T14:00:00.000Z', price: 100 },
    exit: { time: '2026-01-05T15:00:00.000Z', price: 103 },
    initialRisk: 2,
    grossR: 1.5,
    frictionR: 0.1,
    netR: 1.4,
    mfeR: 2.2,
    maeR: 0,
    holdingBars: 5,
    steps: 5,
    tradeCount: 1,
    winCount: 1,
    lossCount: 0,
  };

  it('returns null for a session that never opened a trade', () => {
    expect(settlementSummary(null)).toBeNull();
  });

  it('reads the aggregate fields straight through', () => {
    expect(settlementSummary(result)).toEqual({
      terminationReason: 'horizon',
      netR: 1.4,
      tradeCount: 1,
      winCount: 1,
      lossCount: 0,
    });
  });

  it('defaults the optional counters to zero when the engine omits them', () => {
    const bare: TrainerResult = {
      ...result,
      tradeCount: undefined,
      winCount: undefined,
      lossCount: undefined,
    };
    expect(settlementSummary(bare)).toEqual({
      terminationReason: 'horizon',
      netR: 1.4,
      tradeCount: 0,
      winCount: 0,
      lossCount: 0,
    });
  });
});
