import { describe, expect, it } from 'vitest';
import type { TrainerPosition, TrainerView } from '@kansoku/pro-api';
import type { RawBar } from '@kansoku/shared/types';
import { episodeReturns } from './episodeReturns';

function bar(iso: string, close: number): RawBar {
  return { time: iso, open: close - 1, high: close + 1, low: close - 1.5, close, volume: 1000 };
}

// Last close 110, so a long filled at 100 with a 10-wide risk unit is exactly +1R.
function makeView(overrides: Partial<TrainerView> = {}): TrainerView {
  const base = [bar('2026-01-05T14:00:00.000Z', 100), bar('2026-01-05T14:05:00.000Z', 110)];
  return {
    caseId: 'case-1',
    symbol: 'TRAIN01',
    basePeriod: '5m',
    ladder: ['5m', '15m', '1h'],
    cursor: 0,
    asOf: base.at(-1)!.time,
    bars: { base, mid: base, top: base },
    quote: {},
    phase: 'flat',
    order: null,
    position: null,
    trades: [],
    netR: 0,
    remainingBars: 10,
    terminal: false,
    result: null,
    submitted: false,
    ...overrides,
  };
}

function makePosition(overrides: Partial<TrainerPosition> = {}): TrainerPosition {
  return {
    tradeId: 1,
    direction: 'long',
    decisionBar: 0,
    decisionTime: '2026-01-05T14:00:00.000Z',
    lots: [{ time: '2026-01-05T14:00:00.000Z', price: 100, size: 1, remaining: 1 }],
    exits: [],
    entryPrice: 100,
    entryTime: '2026-01-05T14:00:00.000Z',
    initialStop: 90,
    riskUnit: 10,
    realizedR: 0,
    realizedFrictionR: 0,
    stop: 90,
    target: 130,
    holdingBars: 1,
    mfeR: 0,
    maeR: 0,
    entryReason: { category: 'breakout', summary: '' },
    ...overrides,
  };
}

describe('episodeReturns', () => {
  it('reports no trade figure while flat, and the session figure alone', () => {
    expect(episodeReturns(makeView({ netR: 1.5 }))).toEqual({
      tradeR: null,
      tradePct: null,
      sessionR: 1.5,
    });
  });

  it('prices an open long off the last close', () => {
    const returns = episodeReturns(makeView({ phase: 'open', position: makePosition() }));
    expect(returns.tradeR).toBeCloseTo(1, 10);
    expect(returns.tradePct).toBeCloseTo(10, 10);
  });

  it('flips the sign for a short', () => {
    const returns = episodeReturns(
      makeView({
        phase: 'open',
        position: makePosition({
          direction: 'short',
          lots: [{ time: '2026-01-05T14:00:00.000Z', price: 100, size: 1, remaining: 1 }],
        }),
      }),
    );
    expect(returns.tradeR).toBeCloseTo(-1, 10);
    expect(returns.tradePct).toBeCloseTo(-10, 10);
  });

  // The banked half is what makes this trade a winner; counting only what is still open would show
  // 0R on a trade that has already locked in 1R.
  it('counts realised R from a part-closed trade, not just the open remainder', () => {
    const returns = episodeReturns(
      makeView({
        phase: 'open',
        position: makePosition({
          lots: [{ time: '2026-01-05T14:00:00.000Z', price: 100, size: 1, remaining: 0.5 }],
          exits: [{ time: '2026-01-05T14:05:00.000Z', price: 120, size: 0.5, reason: 'manual' }],
          realizedR: 1,
        }),
      }),
    );
    // 1R banked + 0.5 size still open at +1R per unit
    expect(returns.tradeR).toBeCloseTo(1.5, 10);
  });

  // The engine's closed netR is gross minus friction, so an open trade quoted gross would not be
  // comparable to the session number sitting beside it on the same lane.
  it('nets the friction already paid out of the trade figure', () => {
    const returns = episodeReturns(
      makeView({
        phase: 'open',
        position: makePosition({ realizedR: 1, realizedFrictionR: 0.2 }),
      }),
    );
    expect(returns.tradeR).toBeCloseTo(1.8, 10);
  });

  // episodeNetR sums closed trades only, so the open trade is added rather than double-counted.
  it('adds the open trade to the closed net for the session figure', () => {
    const returns = episodeReturns(makeView({ phase: 'open', position: makePosition(), netR: 2 }));
    expect(returns.sessionR).toBeCloseTo(3, 10);
  });

  it('breaks even against the size-weighted price of what is still open, not the first fill', () => {
    const returns = episodeReturns(
      makeView({
        phase: 'open',
        position: makePosition({
          lots: [
            { time: '2026-01-05T14:00:00.000Z', price: 100, size: 0.5, remaining: 0.5 },
            { time: '2026-01-05T14:05:00.000Z', price: 120, size: 0.5, remaining: 0.5 },
          ],
        }),
      }),
    );
    // Breakeven 110 is the last close, so the open portion is flat even though the first fill wins.
    expect(returns.tradePct).toBeCloseTo(0, 10);
    expect(returns.tradeR).toBeCloseTo(0, 10);
  });

  it('does not divide by a zero risk unit', () => {
    const returns = episodeReturns(
      makeView({ phase: 'open', position: makePosition({ riskUnit: 0 }), netR: 0.5 }),
    );
    expect(returns).toEqual({ tradeR: null, tradePct: null, sessionR: 0.5 });
  });
});
