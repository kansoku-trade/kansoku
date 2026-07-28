import { describe, expect, it } from 'vitest';
import type { TrainerClosedTrade } from '@kansoku/pro-api';
import { tradeBox } from './useTrainerReviewOverlay';

function closedTrade(overrides: Partial<TrainerClosedTrade> = {}): TrainerClosedTrade {
  return {
    tradeId: 1,
    direction: 'long',
    decisionBar: 0,
    decisionTime: '2026-01-05T14:00:00.000Z',
    entry: { time: '2026-01-05T14:05:00.000Z', price: 101 },
    exit: { time: '2026-01-05T14:15:00.000Z', price: 103 },
    exitReason: 'target',
    initialStop: 99,
    finalStop: 99,
    target: 106,
    initialRisk: 2,
    grossR: 1,
    frictionR: 0,
    netR: 1,
    mfeR: 1.2,
    maeR: 0.1,
    holdingBars: 2,
    ...overrides,
  };
}

describe('tradeBox', () => {
  it('spans the first fill to the last exit, drawn against the plan that was set', () => {
    expect(tradeBox(closedTrade())).toEqual({
      startTime: Date.parse('2026-01-05T14:05:00.000Z') / 1000,
      endTime: Date.parse('2026-01-05T14:15:00.000Z') / 1000,
      entry: 101,
      stop: 99,
      target1: 106,
      target2: 106,
      dimmed: false,
    });
  });

  // Averaging the lots here gives 99 — exactly the stop — so the risk half of the box would have
  // collapsed to nothing and the drawn reward-to-risk would have been infinite.
  it('anchors a scaled trade on its first lot, not on the average an add moved', () => {
    const box = tradeBox(
      closedTrade({
        entry: { time: '2026-01-05T14:05:00.000Z', price: 99 },
        lots: [
          { time: '2026-01-05T14:05:00.000Z', price: 101, size: 0.5 },
          { time: '2026-01-05T14:10:00.000Z', price: 97, size: 0.5 },
        ],
      }),
    );
    expect(box.entry).toBe(101);
    expect(box.startTime).toBe(Date.parse('2026-01-05T14:05:00.000Z') / 1000);
  });

  it('dims a stopped-out trade', () => {
    expect(tradeBox(closedTrade({ exitReason: 'stop' })).dimmed).toBe(true);
  });
});
