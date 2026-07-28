import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';
import {
  advanceEpisode,
  checkEpisodeAmendment,
  createEpisodeState,
  EpisodeGuardrailError,
  submitEpisode,
  type EpisodeState,
} from '../../src/episode/engine.js';
import { openSize } from '../../src/episode/position.js';
import { episodeClosedTradeSchema, type EpisodeTradeAction } from '../../src/schema/episode.js';
import type { Question } from '../../src/schema/question.js';
import type { Submission } from '../../src/schema/submission.js';

function bar(time: string, open: number, high: number, low: number, close: number) {
  return { time, open, high, low, close, volume: 1_000 };
}

function question(bars: ReturnType<typeof bar>[]): Question {
  return {
    id: 'swing-SIZING-01',
    bank: 'swing',
    symbol: 'MU.US',
    cutoff: '2026-03-20T20:00:00-04:00',
    layer: 'high-vol-tech',
    adversarial: false,
    fixtures: {
      kline: { day: [bar('2026-03-20', 98, 102, 97, 100)], week: [] },
      indicators: {},
      quote: { last: 100 },
      capitalFlow: {},
      news: [],
      fundamentals: {},
      calendar: {},
    },
    replay: { basePeriod: '1h', entryExpiryBars: 3, horizonBars: bars.length, bars },
  };
}

function prediction(
  direction: 'long' | 'short',
  entry: number,
  stop: number,
  target: number,
): Submission {
  return {
    direction,
    anchor: { timeframe: 'h1', time: '2026-03-20T20:00:00-04:00', price: entry },
    entry_plan: { entry, stop, target1: target },
    scenarios: [
      { label: '主情景', probability: 60 },
      { label: '反向情景', probability: 40 },
    ],
    decision_reason: { category: 'breakout', summary: '价格突破关键结构，按计划入场。' },
    comment: '仓位管理测试',
  };
}

function reasoned<T extends Record<string, unknown>>(action: T): EpisodeTradeAction {
  return {
    ...action,
    reason: { category: 'risk_management', summary: '按仓位计划推进，风险仍在预算内。' },
  } as EpisodeTradeAction;
}

function enter(q: Question, plan: Submission, size?: number): EpisodeState {
  const submitted = submitEpisode(createEpisodeState(), q, plan, {}, 'limit', size);
  return advanceEpisode(submitted.state, q, reasoned({ type: 'hold' })).state;
}

const stopOutBars = [
  bar('2026-03-23T14:30:00Z', 100, 103, 99.5, 102),
  bar('2026-03-23T15:30:00Z', 103, 104, 102, 103.5),
  bar('2026-03-23T16:30:00Z', 103, 103.5, 94, 95),
];

describe('position sizing', () => {
  it('prices a quarter-size stop-out at a quarter of an R', () => {
    const q = question([stopOutBars[0], stopOutBars[2]]);
    const stopped = advanceEpisode(
      enter(q, prediction('long', 100, 95, 130), 0.25),
      q,
      reasoned({ type: 'hold' }),
    );

    expect(stopped.event).toBe('stop_hit');
    const trade = stopped.state.trades[0];
    expect(trade.initialRisk).toBe(5);
    expect(trade.grossR).toBeCloseTo(-0.25, 12);
    expect(trade.netR).toBeCloseTo(-0.25, 12);
    expect(trade.lots).toEqual([{ time: '2026-03-23T14:30:00Z', price: 100, size: 0.25 }]);
    expect(trade.exits).toEqual([
      { time: '2026-03-23T16:30:00Z', price: 95, size: 0.25, reason: 'stop' },
    ]);
  });

  it('keeps the R unit locked at the first fill while the average entry moves', () => {
    const q = question(stopOutBars);
    const opened = enter(q, prediction('long', 100, 95, 130), 0.5);
    expect(opened.position).toMatchObject({ riskUnit: 5, entryPrice: 100 });

    const added = advanceEpisode(opened, q, reasoned({ type: 'add', size: 0.25 })).state;
    expect(added.position!.riskUnit).toBe(5);
    expect(added.position!.entryPrice).toBeCloseTo((100 * 0.5 + 103 * 0.25) / 0.75, 12);

    const stopped = advanceEpisode(added, q, reasoned({ type: 'hold' }));
    expect(stopped.state.trades[0].initialRisk).toBe(5);
  });

  it('makes adding to a position that later stops out cost more, in both directions of averaging', () => {
    const q = question(stopOutBars);

    const halfOnly = advanceEpisode(
      advanceEpisode(enter(q, prediction('long', 100, 95, 130), 0.5), q, reasoned({ type: 'hold' }))
        .state,
      q,
      reasoned({ type: 'hold' }),
    );
    expect(halfOnly.state.trades[0].netR).toBeCloseTo(-0.5, 12);

    const fullFromTheStart = advanceEpisode(
      advanceEpisode(enter(q, prediction('long', 100, 95, 130)), q, reasoned({ type: 'hold' }))
        .state,
      q,
      reasoned({ type: 'hold' }),
    );
    expect(fullFromTheStart.state.trades[0].netR).toBeCloseTo(-1, 12);

    // Pyramiding into strength at 103 and then stopping out: the second lot is a worse entry
    // against the same stop, so the whole trade costs more than the single full-size −1R.
    const pyramided = advanceEpisode(
      advanceEpisode(
        enter(q, prediction('long', 100, 95, 130), 0.5),
        q,
        reasoned({ type: 'add', size: 0.5 }),
      ).state,
      q,
      reasoned({ type: 'hold' }),
    );
    const trade = pyramided.state.trades[0];
    expect(trade.netR).toBeCloseTo(-0.5 + ((95 - 103) * 0.5) / 5, 12);
    expect(trade.netR).toBeCloseTo(-1.3, 12);
    expect(trade.netR).toBeLessThan(fullFromTheStart.state.trades[0].netR);
    expect(trade.netR).toBeLessThan(halfOnly.state.trades[0].netR);

    // The stop closes every open lot at once, and the loss is not rescaled by the added size.
    expect(trade.lots).toHaveLength(2);
    expect(trade.exits).toEqual([
      { time: '2026-03-23T16:30:00Z', price: 95, size: 1, reason: 'stop' },
    ]);
    expect(trade.initialRisk).toBe(5);
  });

  it('nets 1R when half comes off at +2R and the rest returns to the entry', () => {
    const q = question([
      bar('2026-03-23T14:30:00Z', 100, 101, 100, 100.5),
      bar('2026-03-23T15:30:00Z', 110, 110, 109, 109.5),
      bar('2026-03-23T16:30:00Z', 100, 100, 96, 96.5),
      bar('2026-03-23T17:30:00Z', 100, 100.5, 99.5, 100),
    ]);
    const opened = enter(q, prediction('long', 100, 95, 130));
    const scaledOut = advanceEpisode(opened, q, reasoned({ type: 'reduce', size: 0.5 }));

    expect(scaledOut.event).toBe('holding');
    expect(scaledOut.state.phase).toBe('open');
    expect(scaledOut.state.position!.realizedR).toBeCloseTo(1, 12);
    expect(openSize(scaledOut.state.position!)).toBeCloseTo(0.5, 12);

    const held = advanceEpisode(scaledOut.state, q, reasoned({ type: 'hold' }));
    // The remaining half is under water at 96 while the trade as a whole is still +0.6R, so an
    // adverse excursion measured on the open portion alone would wrongly report 0.4R here.
    expect(held.state.position!.maeR).toBe(0);
    expect(held.state.position!.mfeR).toBeCloseTo(2, 12);

    const closed = advanceEpisode(held.state, q, reasoned({ type: 'exit_next_open' }));
    const trade = closed.state.trades[0];
    expect(trade.netR).toBeCloseTo(1, 12);
    expect(trade.mfeR).toBeCloseTo(2, 12);
    expect(trade.maeR).toBe(0);
    expect(trade.mfeR - trade.netR).toBeCloseTo(1, 12);
    expect(trade.exitReason).toBe('manual');
    expect(trade.exits).toEqual([
      { time: '2026-03-23T15:30:00Z', price: 110, size: 0.5, reason: 'manual' },
      { time: '2026-03-23T17:30:00Z', price: 100, size: 0.5, reason: 'manual' },
    ]);
  });

  it('closes lots first in, first out', () => {
    const q = question([
      bar('2026-03-23T14:30:00Z', 100, 101, 99.5, 100.5),
      bar('2026-03-23T15:30:00Z', 104, 105, 103, 104.5),
      bar('2026-03-23T16:30:00Z', 106, 107, 105, 106.5),
      bar('2026-03-23T17:30:00Z', 108, 109, 107, 108.5),
    ]);
    const added = advanceEpisode(
      enter(q, prediction('long', 100, 98, 130), 0.5),
      q,
      reasoned({ type: 'add', size: 0.25 }),
    ).state;
    const reduced = advanceEpisode(added, q, reasoned({ type: 'reduce', size: 0.5 })).state;

    // FIFO retires the 100 lot whole; closing the 104 lot first would leave 100 as the average
    // entry and realize 1.0R instead of 1.5R.
    expect(reduced.position!.realizedR).toBeCloseTo(1.5, 12);
    expect(reduced.position!.entryPrice).toBe(104);
    expect(reduced.position!.lots.map((lot) => lot.remaining)).toEqual([0, 0.25]);

    const closed = advanceEpisode(reduced, q, reasoned({ type: 'exit_next_open' }));
    const trade = closed.state.trades[0];
    expect(trade.netR).toBeCloseTo(2, 12);
    expect(trade.lots).toEqual([
      { time: '2026-03-23T14:30:00Z', price: 100, size: 0.5 },
      { time: '2026-03-23T15:30:00Z', price: 104, size: 0.25 },
    ]);
    expect(trade.exits!.map((exit) => exit.size)).toEqual([0.5, 0.25]);
    // A trade the persistence schema rejects is dropped on read, not reported, so a multi-lot
    // record has to stay writable and readable as an answer.
    expect(Value.Check(episodeClosedTradeSchema, trade)).toBe(true);
  });

  it('turns a legal stop illegal once an add moves the breakeven (TD-EXIT-01)', () => {
    const q = question([
      bar('2026-03-23T14:30:00Z', 100, 102, 99.5, 101.5),
      bar('2026-03-23T15:30:00Z', 101, 102, 100.5, 101.5),
      bar('2026-03-23T16:30:00Z', 101.5, 102, 101, 101.5),
    ]);
    const opened = enter(q, prediction('long', 100, 99, 130), 0.5);
    expect(opened.position).toMatchObject({ entryPrice: 100, stop: 99, mfeR: 1 });
    expect(() => checkEpisodeAmendment(opened, q, { stop: 100.2 })).not.toThrow();

    const added = advanceEpisode(opened, q, reasoned({ type: 'add', size: 0.5 })).state;
    // Adding is never judged retroactively: the stop it was already carrying survives untouched.
    expect(added.position).toMatchObject({ stop: 99, entryPrice: 100.5 });
    expect(() => checkEpisodeAmendment(added, q, { stop: 100.2 })).toThrow(EpisodeGuardrailError);
    expect(() => checkEpisodeAmendment(added, q, { stop: 100.6 })).not.toThrow();
  });

  it('refuses sizes outside a full position and reductions larger than the open size', () => {
    const q = question(stopOutBars);
    const plan = prediction('long', 100, 95, 130);

    expect(() => submitEpisode(createEpisodeState(), q, plan, {}, 'limit', 0)).toThrow(
      /size must be a fraction of a full position/,
    );
    expect(() => submitEpisode(createEpisodeState(), q, plan, {}, 'limit', 1.5)).toThrow(
      /size must be a fraction of a full position/,
    );

    const threeQuarters = advanceEpisode(
      enter(q, plan, 0.5),
      q,
      reasoned({ type: 'add', size: 0.25 }),
    ).state;
    expect(() => advanceEpisode(threeQuarters, q, reasoned({ type: 'add', size: 0.5 }))).toThrow(
      EpisodeGuardrailError,
    );
    expect(() => advanceEpisode(threeQuarters, q, reasoned({ type: 'reduce', size: 0.9 }))).toThrow(
      /cannot reduce 0.9 of a position holding 0.75/,
    );
    expect(() =>
      advanceEpisode(threeQuarters, q, reasoned({ type: 'add', size: 0.25 })),
    ).not.toThrow();
  });

  it('treats a reduce of the whole open size as the manual exit it is', () => {
    const q = question(stopOutBars);
    const opened = enter(q, prediction('long', 100, 95, 130), 0.5);
    const exited = advanceEpisode(opened, q, reasoned({ type: 'reduce', size: 0.5 }));

    expect(exited.event).toBe('manual_exit');
    expect(exited.state.phase).toBe('flat');
    expect(exited.state.trades[0]).toMatchObject({ exitReason: 'manual', netR: 0.3 });

    const untargeted = advanceEpisode(opened, q, reasoned({ type: 'reduce' }));
    expect(untargeted.event).toBe('manual_exit');
    expect(untargeted.state.trades[0]).toEqual(exited.state.trades[0]);
  });

  it('rejects sizing actions outside an open position', () => {
    const q = question(stopOutBars);
    const flat = createEpisodeState();
    expect(() => advanceEpisode(flat, q, reasoned({ type: 'add', size: 0.5 }))).toThrow(
      /invalid while flat/,
    );
    const pending = submitEpisode(flat, q, prediction('long', 90, 85, 130)).state;
    expect(() => advanceEpisode(pending, q, reasoned({ type: 'reduce', size: 0.5 }))).toThrow(
      /invalid while the order is pending/,
    );
  });
});
