import { describe, expect, it } from 'vitest';
import type { TrainerPosition, TrainerView } from '@kansoku/pro-api';
import type { RawBar } from '@kansoku/shared/types';
import {
  addToFullSize,
  buildOrderSubmission,
  canAddSize,
  canReduceSize,
  clampStop,
  clampTarget,
  deriveAnchor,
  directedDraft,
  formatPositionSize,
  formatRewardRisk,
  meetsRewardRiskFloor,
  MIN_GAP,
  MIN_REWARD_RISK,
  NO_REASON_GIVEN,
  openPositionSize,
  reasonOrNotGiven,
  rewardRiskRatio,
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
    submitted: false,
    ...overrides,
  };
}

describe('directedDraft', () => {
  it('keeps the chosen side rather than deriving one from the drag', () => {
    expect(directedDraft('long', 100, { stop: 98, target: 105 })).toEqual({
      direction: 'long',
      entry: 100,
      stop: 98,
      target1: 105,
    });
    expect(directedDraft('short', 100, { stop: 102, target: 95 })).toEqual({
      direction: 'short',
      entry: 100,
      stop: 102,
      target1: 95,
    });
  });

  // The whole point of choosing the side first: the same two prices are a valid long and an
  // invalid short, so the answer depends on the direction, not on the gesture.
  it('accepts a drag for one direction that it refuses for the other', () => {
    const placement = { stop: 98, target: 105 };
    expect(directedDraft('long', 100, placement)).not.toBeNull();
    expect(directedDraft('short', 100, placement)).toBeNull();
  });

  it('refuses a long whose stop or target lands on the wrong side of entry', () => {
    expect(directedDraft('long', 100, { stop: 102, target: 105 })).toBeNull();
    expect(directedDraft('long', 100, { stop: 98, target: 99 })).toBeNull();
  });

  it('refuses a short whose stop or target lands on the wrong side of entry', () => {
    expect(directedDraft('short', 100, { stop: 98, target: 95 })).toBeNull();
    expect(directedDraft('short', 100, { stop: 102, target: 101 })).toBeNull();
  });

  it('refuses a drag that ends where it started', () => {
    expect(directedDraft('long', 100, { stop: 100, target: 100 })).toBeNull();
    expect(directedDraft('short', 100, { stop: 100, target: 100 })).toBeNull();
  });

  // Both edges need a full MIN_GAP of room: a stop or target parked on the entry price is what the
  // engine refuses outright, and rounding to cents happens here so the price shown, the price
  // stored and the price submitted are the same number.
  it('needs MIN_GAP on both sides and rounds the dragged prices to cents', () => {
    expect(directedDraft('long', 100, { stop: 100 - MIN_GAP, target: 100 + MIN_GAP })).toEqual({
      direction: 'long',
      entry: 100,
      stop: 99.99,
      target1: 100.01,
    });
    expect(directedDraft('long', 100, { stop: 99.995, target: 105 })).toBeNull();
    expect(directedDraft('long', 100, { stop: 98.126, target: 105.374 })).toEqual({
      direction: 'long',
      entry: 100,
      stop: 98.13,
      target1: 105.37,
    });
  });
});

describe('reasonOrNotGiven', () => {
  it('keeps the trimmed words and the category they were typed under', () => {
    expect(reasonOrNotGiven('risk_management', '  止损上移锁利  ')).toEqual({
      category: 'risk_management',
      summary: '止损上移锁利',
    });
  });

  // Every reason crosses a boundary that validates summary with minLength 1, so a blank field
  // cannot travel as an empty string.
  it('never produces an empty summary', () => {
    for (const blank of ['', '   ', '\n\t']) {
      const reason = reasonOrNotGiven('risk_management', blank);
      expect(reason.summary.length).toBeGreaterThan(0);
      expect(reason.summary).toBe(NO_REASON_GIVEN);
    }
  });

  // Recording 'risk_management' for words nobody wrote would attribute a rationale to the trader.
  it('drops the category to other when no words were given', () => {
    expect(reasonOrNotGiven('thesis_invalidated', '')).toEqual({
      category: 'other',
      summary: NO_REASON_GIVEN,
    });
  });
});

describe('position size helpers', () => {
  const position = (remaining: number[]): TrainerPosition =>
    ({
      lots: remaining.map((r) => ({ time: '', price: 100, size: r, remaining: r })),
    }) as unknown as TrainerPosition;

  it('adds up what is still open across lots', () => {
    expect(openPositionSize(position([0.5, 0.25]))).toBe(0.75);
    expect(openPositionSize(position([]))).toBe(0);
  });

  it('allows an add exactly up to a full position and refuses beyond it', () => {
    expect(canAddSize(position([0.5]), 0.5)).toBe(true);
    expect(canAddSize(position([0.5, 0.25]), 0.5)).toBe(false);
    expect(canAddSize(position([0.5, 0.25]), 0.25)).toBe(true);
  });

  it('sizes a fill-to-full add by what is left of the headroom, not by a whole position', () => {
    expect(addToFullSize(position([0.25]))).toBe(0.75);
    expect(addToFullSize(position([0.5, 0.25]))).toBe(0.25);
    expect(addToFullSize(position([1]))).toBe(0);
  });

  // The engine refuses a reduce larger than the position as a protocol fault, so the button has to
  // be dark before it is pressed rather than surfacing a developer-facing error afterwards.
  it('allows a reduce only up to what is held', () => {
    expect(canReduceSize(position([0.5]), 0.5)).toBe(true);
    expect(canReduceSize(position([0.25]), 0.5)).toBe(false);
  });

  it('formats a size as a percentage of a full position', () => {
    expect(formatPositionSize(1)).toBe('100%');
    expect(formatPositionSize(0.25)).toBe('25%');
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

  // Asserting the exact landing price, not just the side: a clamp that parks the stop right on the
  // reference is what the engine refuses as crossing the visible price, so the offset is the part
  // that has to hold, and a direction-only assertion would not notice MIN_GAP changing.
  it('lands a clamped price exactly MIN_GAP away from the reference', () => {
    expect(clampStop('long', 101, 102)).toBe(101 - MIN_GAP);
    expect(clampStop('short', 99, 98)).toBe(99 + MIN_GAP);
    expect(clampTarget('long', 101, 99)).toBe(101 + MIN_GAP);
    expect(clampTarget('short', 99, 101)).toBe(99 - MIN_GAP);
    expect(MIN_GAP).toBe(0.01);
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

describe('meetsRewardRiskFloor (TD-RR-01)', () => {
  it('allows exactly the 1.5:1 floor', () => {
    const draft: OrderDraft = { direction: 'long', entry: 100, stop: 99, target1: 101.5 };
    expect(rewardRiskRatio(draft)).toBe(1.5);
    expect(meetsRewardRiskFloor(draft)).toBe(true);
  });

  it('rejects just below the floor', () => {
    const draft: OrderDraft = { direction: 'long', entry: 100, stop: 99, target1: 101.499 };
    expect(meetsRewardRiskFloor(draft)).toBe(false);
  });

  it('rejects when risk is zero (no ratio to floor)', () => {
    const draft: OrderDraft = { direction: 'long', entry: 100, stop: 100, target1: 110 };
    expect(meetsRewardRiskFloor(draft)).toBe(false);
  });

  it('applies the same floor to a short draft', () => {
    const atFloor: OrderDraft = { direction: 'short', entry: 100, stop: 101, target1: 98.5 };
    const belowFloor: OrderDraft = { direction: 'short', entry: 100, stop: 101, target1: 98.501 };
    expect(meetsRewardRiskFloor(atFloor)).toBe(true);
    expect(meetsRewardRiskFloor(belowFloor)).toBe(false);
  });
});

describe('formatRewardRisk', () => {
  it('rounds down, never up to the floor, for a ratio just below 1.5', () => {
    const draft: OrderDraft = { direction: 'long', entry: 100, stop: 99, target1: 101.499 };
    const rr = rewardRiskRatio(draft)!;
    expect(formatRewardRisk(rr)).toBe('1.49');
    // The displayed value must never claim to clear a floor the gate has locked on.
    expect(Number(formatRewardRisk(rr)) >= MIN_REWARD_RISK).toBe(false);
    expect(meetsRewardRiskFloor(draft)).toBe(false);
  });

  it('shows exactly the floor when the ratio is exactly 1.5', () => {
    const draft: OrderDraft = { direction: 'long', entry: 100, stop: 99, target1: 101.5 };
    const rr = rewardRiskRatio(draft)!;
    expect(formatRewardRisk(rr)).toBe('1.50');
    expect(meetsRewardRiskFloor(draft)).toBe(true);
  });

  it('rounds down a comfortably-above-floor ratio too', () => {
    expect(formatRewardRisk(3.987)).toBe('3.98');
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
  it('carries the drafted stop/target1 through and the direction the drag settled on', () => {
    const draft: OrderDraft = { direction: 'long', entry: 100, stop: 99, target1: 108 };
    const submission = buildOrderSubmission(makeView(), draft, '突破前高，放量确认');
    expect(submission.entry_plan).toEqual({ entry: 100, stop: 99, target1: 108 });
    expect(submission.direction).toBe('long');
    expect(submission.scenarios).toEqual([]);
  });

  // A market order fills at the next bar's open, so the live price is the only entry the engine
  // will ever honour — a stale draft entry must not be able to reach it.
  it('always sends the live price as entry, never a stale drafted one', () => {
    const draft: OrderDraft = { direction: 'long', entry: 101, stop: 99, target1: 108 };
    const submission = buildOrderSubmission(makeView(), draft, '突破前高，放量确认');
    expect(submission.entry_plan).toEqual({ entry: 100, stop: 99, target1: 108 });
  });

  it('records the trimmed reason as decision_reason instead of leaving it for the placeholder fallback', () => {
    const draft: OrderDraft = { direction: 'long', entry: 100, stop: 99, target1: 108 };
    const submission = buildOrderSubmission(makeView(), draft, '  突破前高，放量确认  ');
    expect(submission.decision_reason).toEqual({
      category: 'other',
      summary: '突破前高，放量确认',
    });
  });

  it('records that no reason was given rather than inventing one or sending an empty summary', () => {
    const draft: OrderDraft = { direction: 'long', entry: 100, stop: 99, target1: 108 };
    const submission = buildOrderSubmission(makeView(), draft, '   ');
    expect(submission.decision_reason).toEqual({ category: 'other', summary: NO_REASON_GIVEN });
  });
});
