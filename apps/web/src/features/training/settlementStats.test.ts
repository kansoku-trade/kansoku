import { describe, expect, it } from 'vitest';
import type { TrainerClosedTrade, TrainerResult } from '@kansoku/pro-api';
import {
  mfeGivebackR,
  plannedRewardRisk,
  settlementSummary,
  settlementTradeRows,
  settlementTrack,
  trackGeometry,
  tradeEntryFills,
  tradeExitFills,
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

// A half-in, half-added long: two lots at 100 and 96, so the trade-level averaged entry is 98 while
// the engine's risk unit stayed locked against 100. Any statistic that reads 98 here is measuring
// the plan with a ruler the plan was never drawn against.
function scaledInTrade(overrides: Partial<TrainerClosedTrade> = {}): TrainerClosedTrade {
  return trade({
    entry: { time: '2026-01-05T14:00:00.000Z', price: 98 },
    exit: { time: '2026-01-05T16:00:00.000Z', price: 104 },
    lots: [
      { time: '2026-01-05T14:00:00.000Z', price: 100, size: 0.5 },
      { time: '2026-01-05T15:00:00.000Z', price: 96, size: 0.5 },
    ],
    exits: [
      { time: '2026-01-05T16:00:00.000Z', price: 106, size: 0.5, reason: 'target' },
      { time: '2026-01-05T17:00:00.000Z', price: 102, size: 0.5, reason: 'stop' },
    ],
    initialStop: 98,
    initialRisk: 2,
    target: 106,
    exitReason: 'stop',
    ...overrides,
  });
}

describe('tradeEntryFills / tradeExitFills', () => {
  it('reads the recorded lots and exits when the trade carries them', () => {
    const row = scaledInTrade();
    expect(tradeEntryFills(row).map((fill) => [fill.price, fill.size])).toEqual([
      [100, 0.5],
      [96, 0.5],
    ]);
    expect(tradeExitFills(row).map((fill) => [fill.price, fill.size, fill.reason])).toEqual([
      [106, 0.5, 'target'],
      [102, 0.5, 'stop'],
    ]);
  });

  it('reads a pre-sizing trade as one full-size fill each way rather than dropping it', () => {
    const old = trade();
    expect(old.lots).toBeUndefined();
    expect(tradeEntryFills(old)).toEqual([
      { time: '2026-01-05T14:00:00.000Z', price: 100, size: 1 },
    ]);
    expect(tradeExitFills(old)).toEqual([
      { time: '2026-01-05T15:00:00.000Z', price: 103, size: 1, reason: 'target' },
    ]);
  });

  it('falls back the same way when the arrays are present but empty', () => {
    const empty = trade({ lots: [], exits: [] });
    expect(tradeEntryFills(empty)).toHaveLength(1);
    expect(tradeExitFills(empty)).toHaveLength(1);
  });
});

describe('plannedRewardRisk', () => {
  it('is target distance over initial risk, not the eventual exit', () => {
    expect(
      plannedRewardRisk(trade({ target: 106, entry: { time: '', price: 100 }, initialRisk: 2 })),
    ).toBe(3);
  });

  it('is judged at the first fill, not at the average entry an add moved', () => {
    expect(plannedRewardRisk(scaledInTrade())).toBe(3);
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
    expect(rows[0].entries).toEqual([{ time: '2026-01-05T14:00:00.000Z', price: 100, size: 1 }]);
    expect(rows[0].exits).toEqual([
      { time: '2026-01-05T15:00:00.000Z', price: 103, size: 1, reason: 'target' },
    ]);
    expect(rows[0].plannedRewardRisk).toBe(3);
    expect(rows[0].netR).toBe(1.4);
    expect(rows[0].mfeGivebackR).toBeCloseTo(0.8, 6);
    expect(rows[1].direction).toBe('short');
    expect(rows[1].plannedRewardRisk).toBe(3);
    expect(rows[1].mfeGivebackR).toBeCloseTo(1.5, 6);
  });

  it('carries every fill of a scaled-in, scaled-out trade in the order it happened', () => {
    const [row] = settlementTradeRows([scaledInTrade()]);
    expect(row.entries.map((fill) => fill.price)).toEqual([100, 96]);
    expect(row.exits.map((fill) => fill.reason)).toEqual(['target', 'stop']);
  });

  it('returns an empty array for a session with no trades', () => {
    expect(settlementTradeRows([])).toEqual([]);
  });
});

describe('settlementTrack', () => {
  it('totals planned R, banked R and giveback across every trade', () => {
    const track = settlementTrack([
      trade({ netR: 1.4, mfeR: 2.2 }),
      trade({ tradeId: 2, target: 104, initialRisk: 2, netR: -1, mfeR: 0.5 }),
    ]);
    expect(track!.plannedR).toBeCloseTo(5, 6);
    expect(track!.gotR).toBeCloseTo(0.4, 6);
    expect(track!.givebackR).toBeCloseTo(2.3, 6);
    expect(track!.tradeCount).toBe(2);
  });

  it('is null for a session with no trades', () => {
    expect(settlementTrack([])).toBeNull();
  });

  it('reproduces the real stopped-on-fill session: 4.46 planned, nothing banked', () => {
    const track = settlementTrack([
      trade({
        entry: { time: '', price: 98.881109 },
        target: 101.2,
        initialStop: 99.4,
        initialRisk: 0.5188910000000106,
        netR: 0,
        mfeR: 0,
        exitReason: 'stop',
      }),
    ])!;
    expect(track.plannedR).toBeCloseTo(4.4689, 4);
    expect(track.gotR).toBe(0);
    expect(track.givebackR).toBe(0);
  });
});

describe('trackGeometry', () => {
  it('scales the banked and given-back bars against the plan', () => {
    const geom = trackGeometry({ plannedR: 4, gotR: 1, givebackR: 1, tradeCount: 1 });
    expect(geom).toEqual({ gotPct: 25, gotNegative: false, giveLeftPct: 25, givePct: 25 });
  });

  it('widens the scale when banked plus giveback overshoots the plan', () => {
    const geom = trackGeometry({ plannedR: 2, gotR: 3, givebackR: 1, tradeCount: 1 });
    expect(geom.gotPct).toBe(75);
    expect(geom.givePct).toBe(25);
  });

  it('flags a losing session and starts its bar from zero', () => {
    const geom = trackGeometry({ plannedR: 3, gotR: -1.5, givebackR: 0, tradeCount: 1 });
    expect(geom.gotNegative).toBe(true);
    expect(geom.gotPct).toBe(50);
    expect(geom.giveLeftPct).toBe(0);
  });

  it('never divides by zero when the plan promised nothing', () => {
    expect(trackGeometry({ plannedR: 0, gotR: 0, givebackR: 0, tradeCount: 1 })).toEqual({
      gotPct: 0,
      gotNegative: false,
      giveLeftPct: 0,
      givePct: 0,
    });
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
