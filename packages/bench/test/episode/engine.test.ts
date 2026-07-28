import { describe, expect, it } from 'vitest';
import {
  advanceEpisode,
  checkEpisodeAmendment,
  createEpisodeState,
  EpisodeGuardrailError,
  observeEpisode,
  submitEpisode,
} from '../../src/episode/engine.js';
import {
  episodePeriodLadder,
  periodBucketKey,
  periodBucketStart,
  type EpisodeBasePeriod,
  type EpisodeViewPeriod,
} from '../../src/episode/periods.js';
import type { EpisodeTradeAction } from '../../src/schema/episode.js';
import type { Question } from '../../src/schema/question.js';
import type { Submission } from '../../src/schema/submission.js';

function bar(time: string, open: number, high: number, low: number, close: number) {
  return { time, open, high, low, close, volume: 1_000 };
}

function question(
  replay = [
    bar('2026-03-23T14:30:00Z', 100, 106, 99, 105),
    bar('2026-03-23T15:30:00Z', 105, 106, 99, 100),
    bar('2026-03-23T16:30:00Z', 100, 103, 98, 102),
  ],
): Question {
  return {
    id: 'swing-TEST-01',
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
    replay: { basePeriod: '1h', entryExpiryBars: 3, horizonBars: replay.length, bars: replay },
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
    comment: '测试交易计划',
  };
}

function neutral(): Submission {
  return {
    direction: 'neutral',
    anchor: { timeframe: 'h1', time: '2026-03-20T20:00:00-04:00', price: 100 },
    scenarios: [
      { label: '区间', probability: 60 },
      { label: '突破', probability: 40 },
    ],
    decision_reason: { category: 'no_setup', summary: '当前没有满足风险收益要求的机会。' },
    comment: '继续观察',
  };
}

function holdAction<T extends Record<string, unknown>>(action: T): EpisodeTradeAction {
  return action as EpisodeTradeAction;
}

function reasoned<T extends Record<string, unknown>>(action: T): EpisodeTradeAction {
  return {
    ...action,
    reason: { category: 'risk_management', summary: '结构尚未失效，继续按既定风险计划执行。' },
  } as EpisodeTradeAction;
}

describe('episode engine', () => {
  it('allows immediate B0 trading and multiple round trips before the fixed horizon', () => {
    const q = question();
    let state = submitEpisode(createEpisodeState(), q, prediction('long', 100, 95, 104)).state;
    const firstExit = advanceEpisode(state, q, reasoned({ type: 'hold' }));
    expect(firstExit).toMatchObject({ terminal: false, event: 'target_hit' });
    expect(firstExit.state).toMatchObject({ phase: 'flat', cursor: 0, decisionBar: 0 });
    expect(firstExit.state.trades).toHaveLength(1);
    expect(firstExit.state.trades[0].entryReason).toEqual({
      category: 'breakout',
      summary: '价格突破关键结构，按计划入场。',
    });
    expect(
      firstExit.state.actions.map((record) =>
        'reason' in record.action ? record.action.reason?.category : null,
      ),
    ).toEqual(['breakout', 'risk_management']);

    state = submitEpisode(firstExit.state, q, prediction('short', 105, 110, 101)).state;
    const secondExit = advanceEpisode(state, q, reasoned({ type: 'hold' }));
    expect(secondExit).toMatchObject({ terminal: false, event: 'target_hit' });
    expect(secondExit.state.trades).toHaveLength(2);

    const finished = observeEpisode(secondExit.state, q);
    expect(finished).toMatchObject({ terminal: true, event: 'horizon_exit' });
    expect(finished.result).toMatchObject({
      terminationReason: 'horizon',
      tradeCount: 2,
      winCount: 2,
      lossCount: 0,
      decisionBar: 0,
      observationBars: 0,
      grossR: 1.6,
    });
    expect(finished.result!.trades!.map((trade) => trade.direction)).toEqual(['long', 'short']);
  });

  it('does not stop out on the entry bar using a low the order could only have reached before filling', () => {
    // Stop entry at 103 fills only on the way up from a 99 open, so the 96 low belongs to the
    // pending window, not to the position. Only the close is provably after the fill.
    const q = question([
      bar('2026-03-23T14:30:00Z', 99, 104, 96, 103.5),
      bar('2026-03-23T15:30:00Z', 103.5, 105, 103, 104),
    ]);
    const submitted = submitEpisode(createEpisodeState(), q, prediction('long', 103, 97, 110));
    const filled = advanceEpisode(submitted.state, q, reasoned({ type: 'hold' }));
    expect(filled.event).not.toBe('stop_hit');
    expect(filled.state.phase).toBe('open');
    expect(filled.state.trades).toHaveLength(0);
  });

  it('does not take profit on the entry bar using a high the order could only have reached before filling', () => {
    // Limit entry at 98 fills on the way down from a 99.5 open, so the 105 high precedes the fill.
    const q = question([
      bar('2026-03-23T14:30:00Z', 99.5, 105, 97.5, 98.5),
      bar('2026-03-23T15:30:00Z', 98.5, 99, 98, 98.5),
    ]);
    const submitted = submitEpisode(createEpisodeState(), q, prediction('long', 98, 95, 104));
    const filled = advanceEpisode(submitted.state, q, reasoned({ type: 'hold' }));
    expect(filled.event).not.toBe('target_hit');
    expect(filled.state.phase).toBe('open');
    // Favourable excursion on the entry bar may only count the close, not the pre-fill high.
    expect(filled.state.position!.mfeR).toBeCloseTo(0.5 / 3, 6);
  });

  it('keeps observation optional and only activates a delayed order on the following hidden bar', () => {
    const q = question();
    const observed = observeEpisode(createEpisodeState(), q);
    expect(observed).toMatchObject({
      terminal: false,
      event: 'observed',
      asOf: q.replay.bars[0].time,
    });
    const submitted = submitEpisode(observed.state, q, prediction('short', 105, 110, 101));
    expect(submitted.state).toMatchObject({ phase: 'pending', decisionBar: 1 });

    const exited = advanceEpisode(submitted.state, q, reasoned({ type: 'hold' }));
    expect(exited).toMatchObject({ terminal: false, event: 'target_hit' });
    expect(exited.state.trades[0]).toMatchObject({
      decisionBar: 1,
      entry: { time: q.replay.bars[1].time, price: 105 },
    });
  });

  it('treats neutral as a non-terminal flat decision and scores an untraded case at the horizon', () => {
    const q = question();
    const abstained = submitEpisode(createEpisodeState(), q, neutral());
    expect(abstained).toMatchObject({ terminal: false, event: 'abstained', bar: null });
    let state = abstained.state;
    while (state.phase !== 'terminal') state = observeEpisode(state, q).state;
    expect(state.result).toMatchObject({
      terminationReason: 'no_trade',
      tradeCount: 0,
      grossR: 0,
      frictionR: 0,
      netR: 0,
    });
  });

  it('returns to flat after a stop instead of terminating the case', () => {
    const q = question([
      bar('2026-03-23T14:30:00Z', 100, 101, 94, 95),
      bar('2026-03-23T15:30:00Z', 95, 100, 94, 99),
    ]);
    const submitted = submitEpisode(createEpisodeState(), q, prediction('long', 100, 95, 120));
    const stopped = advanceEpisode(submitted.state, q, reasoned({ type: 'hold' }));
    expect(stopped).toMatchObject({ terminal: false, event: 'stop_hit' });
    expect(stopped.state).toMatchObject({ phase: 'flat', cursor: 0 });
    expect(() => submitEpisode(stopped.state, q, prediction('long', 95, 90, 100))).not.toThrow();
  });

  it('applies an amended stop only to the next hidden bar', () => {
    const q = question([
      bar('2026-03-23T14:30:00Z', 100, 103, 99, 102),
      bar('2026-03-23T15:30:00Z', 102, 104, 100, 101),
      bar('2026-03-23T16:30:00Z', 101, 103, 100, 102),
    ]);
    let state = submitEpisode(createEpisodeState(), q, prediction('long', 100, 95, 110)).state;
    state = advanceEpisode(state, q, reasoned({ type: 'hold' })).state;
    const stopped = advanceEpisode(state, q, reasoned({ type: 'amend', stop: 101 }));
    expect(stopped).toMatchObject({ terminal: false, event: 'stop_hit' });
    expect(stopped.state.trades[0]).toMatchObject({ exitReason: 'stop', grossR: 0.2 });
  });

  it('rejects an amendment that moves the stop away from entry, in either direction', () => {
    const q = question();
    const longFilled = advanceEpisode(
      submitEpisode(createEpisodeState(), q, prediction('long', 100, 95, 120)).state,
      q,
      reasoned({ type: 'hold' }),
    );
    expect(() =>
      advanceEpisode(longFilled.state, q, reasoned({ type: 'amend', stop: 94 })),
    ).toThrow(EpisodeGuardrailError);

    const shortFilled = advanceEpisode(
      submitEpisode(createEpisodeState(), q, prediction('short', 105, 110, 90)).state,
      q,
      reasoned({ type: 'hold' }),
    );
    expect(() =>
      advanceEpisode(shortFilled.state, q, reasoned({ type: 'amend', stop: 111 })),
    ).toThrow(EpisodeGuardrailError);
    // A malformed call must stay distinguishable from a guardrail refusal.
    expect(() => advanceEpisode(longFilled.state, q, reasoned({ type: 'amend' }))).not.toThrow(
      EpisodeGuardrailError,
    );
  });

  it('still accepts a tightening amendment and an unchanged stop below 1R', () => {
    const q = question([
      bar('2026-03-23T14:30:00Z', 100, 102, 99, 101),
      bar('2026-03-23T15:30:00Z', 101, 103, 100, 102),
      bar('2026-03-23T16:30:00Z', 102, 103, 101, 102),
    ]);
    const filled = advanceEpisode(
      submitEpisode(createEpisodeState(), q, prediction('long', 100, 95, 120)).state,
      q,
      reasoned({ type: 'hold' }),
    );
    expect(filled.state.position!.mfeR).toBeCloseTo(0.4, 6);
    expect(
      advanceEpisode(filled.state, q, reasoned({ type: 'amend', stop: 97 })).state.position,
    ).toMatchObject({ stop: 97 });
    expect(
      advanceEpisode(filled.state, q, reasoned({ type: 'amend', target: 118 })).state.position,
    ).toMatchObject({ stop: 95, target: 118 });
  });

  it('refuses to relocate the stop past breakeven once the position has booked 1R (TD-EXIT-01)', () => {
    const q = question([
      bar('2026-03-23T14:30:00Z', 100, 102, 99.5, 101.5),
      bar('2026-03-23T15:30:00Z', 101.5, 102, 101, 101.5),
      bar('2026-03-23T16:30:00Z', 101.5, 102, 101, 101.5),
    ]);
    const filled = advanceEpisode(
      submitEpisode(createEpisodeState(), q, prediction('long', 100, 99, 105)).state,
      q,
      reasoned({ type: 'hold' }),
    );
    expect(filled.state.position).toMatchObject({ entryPrice: 100, stop: 99, mfeR: 2 });

    // The ratchet alone accepts this: 99.5 is tighter than 99, yet it still sits below breakeven
    // while the trade is 2R up — exactly the give-back TD-EXIT-01 exists to refuse.
    expect(() =>
      advanceEpisode(filled.state, q, reasoned({ type: 'amend', stop: 99.5 })),
    ).toThrow(EpisodeGuardrailError);
    expect(
      advanceEpisode(filled.state, q, reasoned({ type: 'amend', stop: 100 })).state.position,
    ).toMatchObject({ stop: 100 });
    expect(
      advanceEpisode(filled.state, q, reasoned({ type: 'amend', stop: 100.5 })).state.position,
    ).toMatchObject({ stop: 100.5 });
  });

  it('refuses the same relocation on a short position', () => {
    const q = question([
      bar('2026-03-23T14:30:00Z', 100, 100.5, 98, 98.5),
      bar('2026-03-23T15:30:00Z', 98.5, 99, 98, 98.5),
      bar('2026-03-23T16:30:00Z', 98.5, 99, 98, 98.5),
    ]);
    const filled = advanceEpisode(
      submitEpisode(createEpisodeState(), q, prediction('short', 100, 101, 95)).state,
      q,
      reasoned({ type: 'hold' }),
    );
    expect(filled.state.position).toMatchObject({ entryPrice: 100, stop: 101, mfeR: 2 });

    expect(() =>
      advanceEpisode(filled.state, q, reasoned({ type: 'amend', stop: 100.5 })),
    ).toThrow(EpisodeGuardrailError);
    expect(
      advanceEpisode(filled.state, q, reasoned({ type: 'amend', stop: 100 })).state.position,
    ).toMatchObject({ stop: 100 });
  });

  it('places the breakeven floor at exactly 1R, not above or below it', () => {
    const atOneR = question([
      bar('2026-03-23T14:30:00Z', 100, 101, 99.5, 100.5),
      bar('2026-03-23T15:30:00Z', 100.5, 101, 100, 100.5),
      bar('2026-03-23T16:30:00Z', 100.5, 101, 100, 100.5),
    ]);
    const filledAtOneR = advanceEpisode(
      submitEpisode(createEpisodeState(), atOneR, prediction('long', 100, 99, 105)).state,
      atOneR,
      reasoned({ type: 'hold' }),
    );
    expect(filledAtOneR.state.position!.mfeR).toBe(1);
    expect(() =>
      advanceEpisode(filledAtOneR.state, atOneR, reasoned({ type: 'amend', stop: 99.5 })),
    ).toThrow(EpisodeGuardrailError);

    const belowOneR = question([
      bar('2026-03-23T14:30:00Z', 100, 100.9, 99.5, 100.5),
      bar('2026-03-23T15:30:00Z', 100.5, 100.9, 100, 100.5),
      bar('2026-03-23T16:30:00Z', 100.5, 100.9, 100, 100.5),
    ]);
    const filledBelowOneR = advanceEpisode(
      submitEpisode(createEpisodeState(), belowOneR, prediction('long', 100, 99, 105)).state,
      belowOneR,
      reasoned({ type: 'hold' }),
    );
    expect(filledBelowOneR.state.position!.mfeR).toBeLessThan(1);
    expect(
      advanceEpisode(filledBelowOneR.state, belowOneR, reasoned({ type: 'amend', stop: 99.5 }))
        .state.position,
    ).toMatchObject({ stop: 99.5 });
  });

  it('lets a 1R position amend its target while keeping the stop it never moved', () => {
    const q = question([
      bar('2026-03-23T14:30:00Z', 100, 102, 99.5, 101.5),
      bar('2026-03-23T15:30:00Z', 101.5, 102, 101, 101.5),
      bar('2026-03-23T16:30:00Z', 101.5, 102, 101, 101.5),
    ]);
    const filled = advanceEpisode(
      submitEpisode(createEpisodeState(), q, prediction('long', 100, 99, 105)).state,
      q,
      reasoned({ type: 'hold' }),
    );
    expect(
      advanceEpisode(filled.state, q, reasoned({ type: 'amend', target: 108 })).state.position,
    ).toMatchObject({ stop: 99, target: 108 });
    expect(
      advanceEpisode(filled.state, q, reasoned({ type: 'amend', stop: 99, target: 108 })).state
        .position,
    ).toMatchObject({ stop: 99, target: 108 });
  });

  it('answers the same question through checkEpisodeAmendment without moving the episode', () => {
    const q = question([
      bar('2026-03-23T14:30:00Z', 100, 102, 99.5, 101.5),
      bar('2026-03-23T15:30:00Z', 101.5, 102, 101, 101.5),
      bar('2026-03-23T16:30:00Z', 101.5, 102, 101, 101.5),
    ]);
    const filled = advanceEpisode(
      submitEpisode(createEpisodeState(), q, prediction('long', 100, 99, 105)).state,
      q,
      reasoned({ type: 'hold' }),
    );
    const before = filled.state;

    expect(() => checkEpisodeAmendment(before, q, { stop: 99.5 })).toThrow(EpisodeGuardrailError);
    expect(() => checkEpisodeAmendment(before, q, { stop: 98 })).toThrow(EpisodeGuardrailError);
    expect(() => checkEpisodeAmendment(before, q, { stop: 100 })).not.toThrow();
    expect(() => checkEpisodeAmendment(before, q, {})).toThrow(/requires stop or target/);
    expect(filled.state).toBe(before);
    expect(before.position).toMatchObject({ stop: 99, target: 105 });
    expect(before.cursor).toBe(0);

    const flat = createEpisodeState();
    expect(() => checkEpisodeAmendment(flat, q, { stop: 99 })).toThrow(/invalid while flat/);
    const pending = submitEpisode(flat, q, prediction('long', 100, 99, 105)).state;
    expect(() => checkEpisodeAmendment(pending, q, { stop: 99 })).toThrow(
      /invalid while the order is pending/,
    );
  });

  it('executes a manual exit at the next bar open and keeps the episode active', () => {
    const q = question();
    const filled = advanceEpisode(
      submitEpisode(createEpisodeState(), q, prediction('long', 100, 95, 120)).state,
      q,
      reasoned({ type: 'hold' }),
    );
    const exited = advanceEpisode(filled.state, q, reasoned({ type: 'exit_next_open' }));
    expect(exited).toMatchObject({ terminal: false, event: 'manual_exit' });
    expect(exited.state.trades[0]).toMatchObject({ exitReason: 'manual', exit: { price: 105 } });
  });

  it('expires or cancels pending orders back to flat without ending the episode', () => {
    const q = question([
      bar('2026-03-23T14:30:00Z', 100, 102, 99, 101),
      bar('2026-03-23T15:30:00Z', 101, 103, 100, 102),
      bar('2026-03-23T16:30:00Z', 102, 104, 101, 103),
      bar('2026-03-23T17:30:00Z', 103, 105, 102, 104),
    ]);
    let state = submitEpisode(createEpisodeState(), q, prediction('long', 90, 85, 100)).state;
    state = advanceEpisode(state, q, reasoned({ type: 'hold' })).state;
    state = advanceEpisode(state, q, reasoned({ type: 'hold' })).state;
    const expired = advanceEpisode(state, q, reasoned({ type: 'hold' }));
    expect(expired).toMatchObject({ terminal: false, event: 'no_fill' });
    expect(expired.state.phase).toBe('flat');

    const pending = submitEpisode(expired.state, q, prediction('long', 90, 85, 100));
    const cancelled = advanceEpisode(pending.state, q, reasoned({ type: 'cancel' }));
    expect(cancelled).toMatchObject({ terminal: false, event: 'cancelled', bar: null });
    expect(cancelled.state.phase).toBe('flat');
  });

  it('conservatively resolves a same-bar stop before a target', () => {
    const q = question([bar('2026-03-23T14:30:00Z', 100, 110, 90, 100)]);
    const result = advanceEpisode(
      submitEpisode(createEpisodeState(), q, prediction('long', 100, 95, 106)).state,
      q,
      reasoned({ type: 'hold' }),
    );
    expect(result).toMatchObject({ terminal: true, event: 'stop_hit' });
    expect(result.result!.trades![0]).toMatchObject({ exitReason: 'stop', grossR: -1 });
  });

  it('prices a same-bar stop from an intrabar entry at the stop instead of the earlier open', () => {
    // The close sits below the stop so the stop is provably reached after the intrabar fill; the
    // 97.99 low alone would not trigger it, since a breakout order only fills on the way up.
    const q = question([bar('2026-02-06T14:30:00Z', 98.147166, 100.917579, 97.989683, 98.4)]);
    const result = advanceEpisode(
      submitEpisode(createEpisodeState(), q, prediction('long', 100.1, 98.6, 101.8)).state,
      q,
      reasoned({ type: 'hold' }),
    );

    expect(result).toMatchObject({ terminal: true, event: 'stop_hit' });
    expect(result.result!.trades![0]).toMatchObject({
      entry: { price: 100.1 },
      exit: { price: 98.6 },
      exitReason: 'stop',
      grossR: -1,
    });
  });

  it('immediately closes a gap fill that has already crossed its bracket without counting later excursions', () => {
    const q = question([bar('2026-03-23T14:30:00Z', 85, 89, 80, 82)]);
    const result = advanceEpisode(
      submitEpisode(createEpisodeState(), q, prediction('short', 95, 105, 90)).state,
      q,
      reasoned({ type: 'hold' }),
    );
    expect(result).toMatchObject({ terminal: true, event: 'target_hit' });
    expect(result.result!.trades![0]).toMatchObject({
      entry: { price: 85 },
      exit: { price: 85 },
      exitReason: 'target',
      grossR: 0,
      holdingBars: 0,
      mfeR: 0,
      maeR: 0,
    });
  });

  it('forces an open position out at the final close', () => {
    const q = question([bar('2026-03-23T14:30:00Z', 100, 103, 99, 102)]);
    const result = advanceEpisode(
      submitEpisode(createEpisodeState(), q, prediction('long', 100, 95, 120)).state,
      q,
      reasoned({ type: 'hold' }),
    );
    expect(result).toMatchObject({ terminal: true, event: 'horizon_exit' });
    expect(result.result).toMatchObject({
      terminationReason: 'horizon',
      tradeCount: 1,
      grossR: 0.4,
    });
    expect(result.result!.trades![0]).toMatchObject({
      exitReason: 'horizon',
      exit: { price: 102 },
    });
  });

  it('reports the newly revealed bar at its own base period, not a hardcoded 1h tier', () => {
    // The 1m ladder is ['1m','5m','15m'] — there is no 1h tier at all, so a
    // hardcoded fixtures.kline['1h'] lookup hits a genuinely absent key on both
    // sides of the advance and reports no new bars, no matter what was revealed.
    const oneMinute: Question = {
      id: 'swing-ONEMIN-01',
      bank: 'swing',
      symbol: 'MU.US',
      cutoff: '2026-03-23T13:25:00Z',
      layer: 'high-vol-tech',
      adversarial: false,
      fixtures: {
        kline: { day: [] },
        indicators: {},
        quote: { last: 100 },
        capitalFlow: {},
        news: [],
        fundamentals: {},
        calendar: {},
      },
      replay: {
        basePeriod: '1m',
        horizonBars: 2,
        bars: [
          bar('2026-03-23T13:30:00Z', 100, 101, 99, 100.5),
          bar('2026-03-23T13:31:00Z', 100.5, 101.5, 100, 101),
        ],
      },
    };
    const first = observeEpisode(createEpisodeState(), oneMinute);
    expect(first.newBars.base).toEqual([oneMinute.replay.bars[0]]);
  });

  function ladderQuestion(basePeriod: EpisodeBasePeriod, bars: ReturnType<typeof bar>[]): Question {
    return {
      id: `swing-LADDER-${basePeriod}`,
      bank: 'swing',
      symbol: 'MU.US',
      cutoff: '2026-03-20T20:00:00-04:00',
      layer: 'high-vol-tech',
      adversarial: false,
      fixtures: {
        kline: { day: [], week: [] },
        indicators: {},
        quote: { last: 100 },
        capitalFlow: {},
        news: [],
        fundamentals: {},
        calendar: {},
      },
      replay: { basePeriod, horizonBars: bars.length, bars },
    };
  }

  function firstBoundaryCrossing(
    period: EpisodeViewPeriod,
    bars: ReturnType<typeof bar>[],
  ): number {
    for (let i = 1; i < bars.length; i++) {
      if (periodBucketKey(period, bars[i - 1].time) !== periodBucketKey(period, bars[i].time)) {
        return i;
      }
    }
    throw new Error(`fixture never crosses a ${period} boundary`);
  }

  function observeAll(q: Question) {
    let state = createEpisodeState();
    const results: ReturnType<typeof observeEpisode>[] = [];
    for (let i = 0; i < q.replay.bars.length; i++) {
      const result = observeEpisode(state, q);
      results.push(result);
      state = result.state;
    }
    return results;
  }

  it.each([
    [
      '1m' as const,
      Array.from({ length: 20 }, (_, i) =>
        bar(
          `2026-03-23T13:${String(30 + i).padStart(2, '0')}:00Z`,
          100 + i,
          101 + i,
          99 + i,
          100.5 + i,
        ),
      ),
    ],
    [
      '5m' as const,
      [
        bar('2026-03-23T13:30:00Z', 100, 101, 99, 100.2),
        bar('2026-03-23T13:35:00Z', 100, 101, 99, 100.2),
        bar('2026-03-23T13:40:00Z', 100, 101, 99, 100.2),
        bar('2026-03-23T13:45:00Z', 100, 101, 99, 100.2),
        bar('2026-03-23T13:50:00Z', 100, 101, 99, 100.2),
        bar('2026-03-23T13:55:00Z', 100, 101, 99, 100.2),
        bar('2026-03-23T14:00:00Z', 100, 101, 99, 100.2),
        bar('2026-03-23T14:05:00Z', 100, 101, 99, 100.2),
        bar('2026-03-23T14:10:00Z', 100, 101, 99, 100.2),
        bar('2026-03-23T14:15:00Z', 100, 101, 99, 100.2),
        bar('2026-03-23T14:20:00Z', 100, 101, 99, 100.2),
        bar('2026-03-23T14:25:00Z', 100, 101, 99, 100.2),
        bar('2026-03-23T14:30:00Z', 100, 101, 99, 100.2),
        bar('2026-03-23T14:35:00Z', 100, 101, 99, 100.2),
        bar('2026-03-23T14:40:00Z', 100, 101, 99, 100.2),
      ],
    ],
    [
      '15m' as const,
      [
        bar('2026-03-23T13:30:00Z', 100, 101, 99, 100.2),
        bar('2026-03-23T13:45:00Z', 100, 101, 99, 100.2),
        bar('2026-03-23T14:00:00Z', 100, 101, 99, 100.2),
        bar('2026-03-23T14:15:00Z', 100, 101, 99, 100.2),
        bar('2026-03-23T14:30:00Z', 100, 101, 99, 100.2),
        bar('2026-03-24T13:30:00Z', 100, 101, 99, 100.2),
        bar('2026-03-24T13:45:00Z', 100, 101, 99, 100.2),
      ],
    ],
    [
      '30m' as const,
      [
        bar('2026-03-23T13:30:00Z', 100, 101, 99, 100.2),
        bar('2026-03-23T14:00:00Z', 100, 101, 99, 100.2),
        bar('2026-03-23T14:30:00Z', 100, 101, 99, 100.2),
        bar('2026-03-24T13:30:00Z', 100, 101, 99, 100.2),
      ],
    ],
    [
      '1h' as const,
      [
        bar('2026-03-23T14:30:00Z', 100, 101, 99, 100.2),
        bar('2026-03-23T15:30:00Z', 100, 101, 99, 100.2),
        bar('2026-03-24T14:30:00Z', 100, 101, 99, 100.2),
        bar('2026-03-30T14:30:00Z', 100, 101, 99, 100.2),
      ],
    ],
  ])(
    'reports a fresh mid bar at the ladder mid boundary and a fresh top bar at the ladder top boundary for a %s episode',
    (basePeriod, bars) => {
      const [, midPeriod, topPeriod] = episodePeriodLadder(basePeriod);
      const midCrossAt = firstBoundaryCrossing(midPeriod, bars);
      const topCrossAt = firstBoundaryCrossing(topPeriod, bars);
      const results = observeAll(ladderQuestion(basePeriod, bars));

      expect(
        results[midCrossAt].newBars.mid.some(
          (b) => b.time === periodBucketStart(midPeriod, bars[midCrossAt].time),
        ),
      ).toBe(true);
      expect(
        results[topCrossAt].newBars.top.some(
          (b) => b.time === periodBucketStart(topPeriod, bars[topCrossAt].time),
        ),
      ).toBe(true);
    },
  );

  function fiveMinuteQuestion(bars: ReturnType<typeof bar>[], horizonBars = bars.length): Question {
    return {
      id: 'swing-FIVEMIN-01',
      bank: 'swing',
      symbol: 'MU.US',
      cutoff: '2026-03-23T13:00:00Z',
      layer: 'high-vol-tech',
      adversarial: false,
      fixtures: {
        kline: { day: [] },
        indicators: {},
        quote: { last: 100 },
        capitalFlow: {},
        news: [],
        fundamentals: {},
        calendar: {},
      },
      replay: { basePeriod: '5m', entryExpiryBars: 3, horizonBars, bars },
    };
  }

  it('advances a mid-tier period on a 5m episode by exactly its base-bar count and lands on the bucket boundary', () => {
    const q = fiveMinuteQuestion([
      bar('2026-03-23T13:30:00Z', 100, 101, 99, 100.2),
      bar('2026-03-23T13:35:00Z', 100.2, 101, 99.5, 100.4),
      bar('2026-03-23T13:40:00Z', 100.4, 101, 99.5, 100.6),
      bar('2026-03-23T13:45:00Z', 100.6, 101, 100, 100.8),
      bar('2026-03-23T13:50:00Z', 100.8, 101.2, 100.2, 100.9),
      bar('2026-03-23T13:55:00Z', 100.9, 101.3, 100.3, 101),
      bar('2026-03-23T14:00:00Z', 101, 101.5, 100.5, 101.2),
    ]);
    let state = createEpisodeState();
    state = observeEpisode(state, q).state;
    state = observeEpisode(state, q).state;
    state = observeEpisode(state, q).state;
    expect(state.cursor).toBe(2);

    const action = holdAction({ type: 'hold', bars: 1, period: '15m' });
    const result = advanceEpisode(state, q, action);

    expect(result.batchAdvancedBars).toBe(3);
    expect(result.state.cursor).toBe(5);
    expect(periodBucketKey('15m', q.replay.bars[5].time)).not.toBe(
      periodBucketKey('15m', q.replay.bars[6].time),
    );
  });

  it('rejects a batch-advance period outside the episode ladder instead of silently falling back', () => {
    const oneMinute: Question = {
      id: 'swing-ONEMIN-02',
      bank: 'swing',
      symbol: 'MU.US',
      cutoff: '2026-03-23T13:25:00Z',
      layer: 'high-vol-tech',
      adversarial: false,
      fixtures: {
        kline: { day: [] },
        indicators: {},
        quote: { last: 100 },
        capitalFlow: {},
        news: [],
        fundamentals: {},
        calendar: {},
      },
      replay: {
        basePeriod: '1m',
        horizonBars: 3,
        bars: [
          bar('2026-03-23T13:30:00Z', 100, 101, 99, 100.5),
          bar('2026-03-23T13:31:00Z', 100.5, 101.5, 100, 101),
          bar('2026-03-23T13:32:00Z', 101, 102, 100.5, 101.5),
        ],
      },
    };
    const action = holdAction({ type: 'hold', bars: 1, period: '1h' });
    expect(() => advanceEpisode(createEpisodeState(), oneMinute, action)).toThrow(
      "period '1h' is not part of the 1m ladder (1m, 5m, 15m)",
    );
  });

  it('a batch advance across a stop-hit bar produces the identical trade outcome to stepping one bar at a time', () => {
    const bars = [
      bar('2026-03-23T13:30:00Z', 100, 101, 99, 100.3),
      bar('2026-03-23T13:35:00Z', 100.3, 101, 100, 100.5),
      bar('2026-03-23T13:40:00Z', 100.5, 101, 94, 95),
      bar('2026-03-23T13:45:00Z', 95, 96, 93, 94),
      bar('2026-03-23T13:50:00Z', 94, 95, 92, 93),
      bar('2026-03-23T13:55:00Z', 93, 94, 91, 92),
      bar('2026-03-23T14:00:00Z', 92, 93, 90, 91),
      bar('2026-03-23T14:05:00Z', 91, 92, 89, 90),
      bar('2026-03-23T14:10:00Z', 90, 91, 88, 89),
    ];
    const q = fiveMinuteQuestion(bars);
    const plan = prediction('long', 100, 97, 110);

    const filledA = advanceEpisode(
      submitEpisode(createEpisodeState(), q, plan).state,
      q,
      reasoned({ type: 'hold' }),
    );
    const stepA1 = advanceEpisode(filledA.state, q, reasoned({ type: 'hold' }));
    const stepA2 = advanceEpisode(stepA1.state, q, reasoned({ type: 'hold' }));
    expect(stepA2.event).toBe('stop_hit');

    const filledB = advanceEpisode(
      submitEpisode(createEpisodeState(), q, plan).state,
      q,
      reasoned({ type: 'hold' }),
    );
    const batchB = advanceEpisode(
      filledB.state,
      q,
      reasoned({ type: 'hold', bars: 5, period: '15m' }),
    );

    expect(batchB.event).toBe('stop_hit');
    expect(batchB.batchAdvancedBars).toBe(2);
    expect(batchB.state.cursor).toBe(stepA2.state.cursor);
    expect(batchB.state.phase).toBe(stepA2.state.phase);
    expect(batchB.state.trades).toEqual(stepA2.state.trades);
  });

  it('1h batch advance by day and by week behaves exactly as today', () => {
    const bars = [
      bar('2026-03-23T14:30:00Z', 100, 103, 99, 101),
      bar('2026-03-23T15:30:00Z', 101, 104, 100, 102),
      bar('2026-03-23T16:30:00Z', 102, 105, 101, 103),
      bar('2026-03-23T17:30:00Z', 103, 106, 102, 104),
      bar('2026-03-24T14:30:00Z', 104, 107, 103, 105),
      bar('2026-03-24T15:30:00Z', 105, 108, 104, 106),
      bar('2026-03-30T14:30:00Z', 106, 109, 105, 107),
      bar('2026-04-06T14:30:00Z', 107, 110, 106, 108),
    ];
    const q = question(bars);
    let state = createEpisodeState();
    for (let i = 0; i < 4; i++) state = observeEpisode(state, q).state;
    expect(state.cursor).toBe(3);

    const dayAction = { type: 'hold', bars: 1, period: 'day' } as EpisodeTradeAction;
    const dayResult = advanceEpisode(state, q, dayAction);
    expect(dayResult.batchAdvancedBars).toBe(2);
    expect(dayResult.state.cursor).toBe(5);
    expect(periodBucketKey('day', bars[5].time)).not.toBe(periodBucketKey('day', bars[6].time));

    const weekAction = { type: 'hold', bars: 1, period: 'week' } as EpisodeTradeAction;
    const weekResult = advanceEpisode(dayResult.state, q, weekAction);
    expect(weekResult.batchAdvancedBars).toBe(1);
    expect(weekResult.state.cursor).toBe(6);
    expect(periodBucketKey('week', bars[6].time)).not.toBe(periodBucketKey('week', bars[7].time));
  });

  it('fills a market-now entry at the next bar open, not the visible price at submission, and still requires stop and target', () => {
    const q: Question = {
      id: 'swing-MARKETNOW-01',
      bank: 'swing',
      symbol: 'MU.US',
      cutoff: '2026-03-23T13:00:00Z',
      layer: 'high-vol-tech',
      adversarial: false,
      fixtures: {
        kline: { day: [] },
        indicators: {},
        quote: { last: 95 },
        capitalFlow: {},
        news: [],
        fundamentals: {},
        calendar: {},
      },
      replay: {
        basePeriod: '1h',
        entryExpiryBars: 3,
        horizonBars: 2,
        bars: [
          bar('2026-03-23T14:30:00Z', 100, 103, 98, 101),
          bar('2026-03-23T15:30:00Z', 101, 104, 99, 102),
        ],
      },
    };

    const marketSubmitted = submitEpisode(
      createEpisodeState(),
      q,
      prediction('long', 95, 90, 108),
      {},
      'market',
    );
    const marketFilled = advanceEpisode(marketSubmitted.state, q, reasoned({ type: 'hold' }));
    expect(marketFilled.event).toBe('filled');
    expect(marketFilled.state.phase).toBe('open');
    expect(marketFilled.state.position).toMatchObject({
      direction: 'long',
      entryPrice: 100,
      entryTime: '2026-03-23T14:30:00Z',
      stop: 90,
      target: 108,
    });

    const limitSubmitted = submitEpisode(createEpisodeState(), q, prediction('long', 100, 90, 108));
    const limitFilled = advanceEpisode(limitSubmitted.state, q, reasoned({ type: 'hold' }));
    expect(Object.keys(marketFilled.state.position!).sort()).toEqual(
      Object.keys(limitFilled.state.position!).sort(),
    );
    expect(marketFilled.state.position).toEqual(limitFilled.state.position);
  });

  it('does not let entryExpiryBars apply to a market-now order', () => {
    const q = question([
      bar('2026-03-23T14:30:00Z', 100, 103, 98, 101),
      bar('2026-03-23T15:30:00Z', 101, 104, 99, 102),
    ]);
    const submitted = submitEpisode(
      createEpisodeState(),
      q,
      prediction('long', 100, 95, 120),
      {},
      'market',
    );
    const filled = advanceEpisode(submitted.state, q, reasoned({ type: 'hold' }));
    expect(filled.event).toBe('filled');
    expect(filled.state.order).toBeNull();
  });

  it('routes market-now entries through the same stop/target validation as limit entries', () => {
    const q = question();
    expect(() =>
      submitEpisode(createEpisodeState(), q, prediction('long', 100, 105, 110), {}, 'market'),
    ).toThrow('invalid long stop');
    expect(() =>
      submitEpisode(createEpisodeState(), q, prediction('long', 100, 95, 90), {}, 'market'),
    ).toThrow('invalid long target');
  });
});
