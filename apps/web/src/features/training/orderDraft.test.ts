import { describe, expect, it } from 'vitest';
import type { TrainerView } from '@kansoku/pro-api';
import type { RawBar } from '@kansoku/shared/types';
import {
  buildOrderSubmission,
  clampStop,
  clampTarget,
  defaultOrderDraft,
  deriveAnchor,
  rewardRiskRatio,
  withDirection,
  type OrderDraft,
} from './orderDraft';

function bar(iso: string, close: number): RawBar {
  return { time: iso, open: close - 1, high: close + 1, low: close - 1.5, close, volume: 1000 };
}

function makeView(overrides: Partial<TrainerView> = {}): TrainerView {
  const base = [bar('2026-01-05T14:00:00.000Z', 100), bar('2026-01-05T14:05:00.000Z', 100)];
  return {
    caseId: 'case-1',
    symbol: 'TRAIN01',
    basePeriod: '5m',
    ladder: ['5m', '15m', '1h'],
    cursor: base.length - 1,
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
    ...overrides,
  };
}

describe('defaultOrderDraft', () => {
  it('anchors entry to the last base bar close', () => {
    const draft = defaultOrderDraft(makeView());
    expect(draft.entry).toBe(100);
    expect(draft.direction).toBe('long');
    expect(draft.stop).toBeLessThan(draft.entry);
    expect(draft.target1).toBeGreaterThan(draft.entry);
  });
});

describe('clampStop / clampTarget', () => {
  it('keeps a long stop below entry and target above entry', () => {
    expect(clampStop('long', 100, 105)).toBeLessThan(100);
    expect(clampTarget('long', 100, 95)).toBeGreaterThan(100);
  });

  it('keeps a short stop above entry and target below entry', () => {
    expect(clampStop('short', 100, 95)).toBeGreaterThan(100);
    expect(clampTarget('short', 100, 105)).toBeLessThan(100);
  });

  it('passes through already-valid prices unchanged', () => {
    expect(clampStop('long', 100, 98)).toBe(98);
    expect(clampTarget('long', 100, 110)).toBe(110);
  });
});

describe('withDirection', () => {
  it('mirrors stop/target distance around entry on a real flip', () => {
    const draft: OrderDraft = { direction: 'long', entry: 100, stop: 99, target1: 102 };
    const flipped = withDirection(draft, 'short');
    expect(flipped.direction).toBe('short');
    expect(flipped.stop).toBe(101);
    expect(flipped.target1).toBe(98);
  });

  it('is a no-op when the direction is unchanged', () => {
    const draft: OrderDraft = { direction: 'long', entry: 100, stop: 99, target1: 102 };
    expect(withDirection(draft, 'long')).toBe(draft);
  });
});

describe('rewardRiskRatio', () => {
  it('computes reward/risk for a long draft', () => {
    const draft: OrderDraft = { direction: 'long', entry: 100, stop: 99, target1: 103 };
    expect(rewardRiskRatio(draft)).toBe(3);
  });

  it('computes reward/risk for a short draft', () => {
    const draft: OrderDraft = { direction: 'short', entry: 100, stop: 101, target1: 97 };
    expect(rewardRiskRatio(draft)).toBe(3);
  });

  it('returns null when risk is zero', () => {
    const draft: OrderDraft = { direction: 'long', entry: 100, stop: 100, target1: 103 };
    expect(rewardRiskRatio(draft)).toBeNull();
  });
});

describe('deriveAnchor', () => {
  it('maps the base period to an allowed anchor timeframe', () => {
    const anchor = deriveAnchor(makeView({ basePeriod: '30m' }));
    expect(anchor.timeframe).toBe('h1');
    expect(anchor.price).toBe(100);
  });
});

describe('buildOrderSubmission', () => {
  it('carries the drafted entry/stop/target1 through for a limit order', () => {
    const draft: OrderDraft = { direction: 'long', entry: 101, stop: 99, target1: 108 };
    const submission = buildOrderSubmission(makeView(), draft, 'limit');
    expect(submission.entry_plan).toEqual({ entry: 101, stop: 99, target1: 108 });
    expect(submission.direction).toBe('long');
    expect(submission.scenarios.length).toBeGreaterThanOrEqual(2);
  });

  it('overrides entry with the live price for a market order, keeping stop/target as drafted', () => {
    const draft: OrderDraft = { direction: 'long', entry: 101, stop: 99, target1: 108 };
    const submission = buildOrderSubmission(makeView(), draft, 'market');
    expect(submission.entry_plan).toEqual({ entry: 100, stop: 99, target1: 108 });
  });
});
