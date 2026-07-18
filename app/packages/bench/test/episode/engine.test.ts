import { describe, expect, it } from "vitest";
import { advanceEpisode, createEpisodeState, observeEpisode, submitEpisode } from "../../src/episode/engine.js";
import type { EpisodeTradeAction } from "../../src/schema/episode.js";
import type { Question } from "../../src/schema/question.js";
import type { Submission } from "../../src/schema/submission.js";

function bar(time: string, open: number, high: number, low: number, close: number) {
  return { time, open, high, low, close, volume: 1_000 };
}

function question(replay = [
  bar("2026-03-23T14:30:00Z", 100, 106, 99, 105),
  bar("2026-03-23T15:30:00Z", 105, 106, 99, 100),
  bar("2026-03-23T16:30:00Z", 100, 103, 98, 102),
]): Question {
  return {
    id: "swing-TEST-01",
    bank: "swing",
    symbol: "MU.US",
    cutoff: "2026-03-20T20:00:00-04:00",
    layer: "high-vol-tech",
    adversarial: false,
    fixtures: {
      kline: { day: [bar("2026-03-20", 98, 102, 97, 100)], week: [] },
      indicators: {},
      quote: { last: 100 },
      capitalFlow: {},
      news: [],
      fundamentals: {},
      calendar: {},
    },
    replay: { basePeriod: "1h", entryExpiryBars: 3, horizonBars: replay.length, bars: replay },
  };
}

function prediction(direction: "long" | "short", entry: number, stop: number, target: number): Submission {
  return {
    direction,
    anchor: { timeframe: "h1", time: "2026-03-20T20:00:00-04:00", price: entry },
    entry_plan: { entry, stop, target1: target },
    scenarios: [
      { label: "主情景", probability: 60 },
      { label: "反向情景", probability: 40 },
    ],
    decision_reason: { category: "breakout", summary: "价格突破关键结构，按计划入场。" },
    comment: "测试交易计划",
  };
}

function neutral(): Submission {
  return {
    direction: "neutral",
    anchor: { timeframe: "h1", time: "2026-03-20T20:00:00-04:00", price: 100 },
    scenarios: [
      { label: "区间", probability: 60 },
      { label: "突破", probability: 40 },
    ],
    decision_reason: { category: "no_setup", summary: "当前没有满足风险收益要求的机会。" },
    comment: "继续观察",
  };
}

function reasoned<T extends Record<string, unknown>>(action: T): EpisodeTradeAction {
  return {
    ...action,
    reason: { category: "risk_management", summary: "结构尚未失效，继续按既定风险计划执行。" },
  } as EpisodeTradeAction;
}

describe("episode engine", () => {
  it("allows immediate B0 trading and multiple round trips before the fixed horizon", () => {
    const q = question();
    let state = submitEpisode(createEpisodeState(), q, prediction("long", 100, 95, 104)).state;
    const firstExit = advanceEpisode(state, q, reasoned({ type: "hold" }));
    expect(firstExit).toMatchObject({ terminal: false, event: "target_hit" });
    expect(firstExit.state).toMatchObject({ phase: "flat", cursor: 0, decisionBar: 0 });
    expect(firstExit.state.trades).toHaveLength(1);
    expect(firstExit.state.trades[0].entryReason).toEqual({
      category: "breakout",
      summary: "价格突破关键结构，按计划入场。",
    });
    expect(firstExit.state.actions.map((record) =>
      "reason" in record.action ? record.action.reason?.category : null
    )).toEqual(["breakout", "risk_management"]);

    state = submitEpisode(firstExit.state, q, prediction("short", 105, 110, 101)).state;
    const secondExit = advanceEpisode(state, q, reasoned({ type: "hold" }));
    expect(secondExit).toMatchObject({ terminal: false, event: "target_hit" });
    expect(secondExit.state.trades).toHaveLength(2);

    const finished = observeEpisode(secondExit.state, q);
    expect(finished).toMatchObject({ terminal: true, event: "horizon_exit" });
    expect(finished.result).toMatchObject({
      terminationReason: "horizon",
      tradeCount: 2,
      winCount: 2,
      lossCount: 0,
      decisionBar: 0,
      observationBars: 0,
      grossR: 1.6,
    });
    expect(finished.result!.trades!.map((trade) => trade.direction)).toEqual(["long", "short"]);
  });

  it("keeps observation optional and only activates a delayed order on the following hidden bar", () => {
    const q = question();
    const observed = observeEpisode(createEpisodeState(), q);
    expect(observed).toMatchObject({ terminal: false, event: "observed", asOf: q.replay.bars[0].time });
    const submitted = submitEpisode(observed.state, q, prediction("short", 105, 110, 101));
    expect(submitted.state).toMatchObject({ phase: "pending", decisionBar: 1 });

    const exited = advanceEpisode(submitted.state, q, reasoned({ type: "hold" }));
    expect(exited).toMatchObject({ terminal: false, event: "target_hit" });
    expect(exited.state.trades[0]).toMatchObject({
      decisionBar: 1,
      entry: { time: q.replay.bars[1].time, price: 105 },
    });
  });

  it("treats neutral as a non-terminal flat decision and scores an untraded case at the horizon", () => {
    const q = question();
    const abstained = submitEpisode(createEpisodeState(), q, neutral());
    expect(abstained).toMatchObject({ terminal: false, event: "abstained", bar: null });
    let state = abstained.state;
    while (state.phase !== "terminal") state = observeEpisode(state, q).state;
    expect(state.result).toMatchObject({
      terminationReason: "no_trade",
      tradeCount: 0,
      grossR: 0,
      frictionR: 0,
      netR: 0,
    });
  });

  it("returns to flat after a stop instead of terminating the case", () => {
    const q = question([
      bar("2026-03-23T14:30:00Z", 100, 101, 94, 95),
      bar("2026-03-23T15:30:00Z", 95, 100, 94, 99),
    ]);
    const submitted = submitEpisode(createEpisodeState(), q, prediction("long", 100, 95, 120));
    const stopped = advanceEpisode(submitted.state, q, reasoned({ type: "hold" }));
    expect(stopped).toMatchObject({ terminal: false, event: "stop_hit" });
    expect(stopped.state).toMatchObject({ phase: "flat", cursor: 0 });
    expect(() => submitEpisode(stopped.state, q, prediction("long", 95, 90, 100))).not.toThrow();
  });

  it("applies an amended stop only to the next hidden bar", () => {
    const q = question([
      bar("2026-03-23T14:30:00Z", 100, 103, 99, 102),
      bar("2026-03-23T15:30:00Z", 102, 104, 100, 101),
      bar("2026-03-23T16:30:00Z", 101, 103, 100, 102),
    ]);
    let state = submitEpisode(createEpisodeState(), q, prediction("long", 100, 95, 110)).state;
    state = advanceEpisode(state, q, reasoned({ type: "hold" })).state;
    const stopped = advanceEpisode(state, q, reasoned({ type: "amend", stop: 101 }));
    expect(stopped).toMatchObject({ terminal: false, event: "stop_hit" });
    expect(stopped.state.trades[0]).toMatchObject({ exitReason: "stop", grossR: 0.2 });
  });

  it("executes a manual exit at the next bar open and keeps the episode active", () => {
    const q = question();
    const filled = advanceEpisode(
      submitEpisode(createEpisodeState(), q, prediction("long", 100, 95, 120)).state,
      q,
      reasoned({ type: "hold" }),
    );
    const exited = advanceEpisode(filled.state, q, reasoned({ type: "exit_next_open" }));
    expect(exited).toMatchObject({ terminal: false, event: "manual_exit" });
    expect(exited.state.trades[0]).toMatchObject({ exitReason: "manual", exit: { price: 105 } });
  });

  it("expires or cancels pending orders back to flat without ending the episode", () => {
    const q = question([
      bar("2026-03-23T14:30:00Z", 100, 102, 99, 101),
      bar("2026-03-23T15:30:00Z", 101, 103, 100, 102),
      bar("2026-03-23T16:30:00Z", 102, 104, 101, 103),
      bar("2026-03-23T17:30:00Z", 103, 105, 102, 104),
    ]);
    let state = submitEpisode(createEpisodeState(), q, prediction("long", 90, 85, 100)).state;
    state = advanceEpisode(state, q, reasoned({ type: "hold" })).state;
    state = advanceEpisode(state, q, reasoned({ type: "hold" })).state;
    const expired = advanceEpisode(state, q, reasoned({ type: "hold" }));
    expect(expired).toMatchObject({ terminal: false, event: "no_fill" });
    expect(expired.state.phase).toBe("flat");

    const pending = submitEpisode(expired.state, q, prediction("long", 90, 85, 100));
    const cancelled = advanceEpisode(pending.state, q, reasoned({ type: "cancel" }));
    expect(cancelled).toMatchObject({ terminal: false, event: "cancelled", bar: null });
    expect(cancelled.state.phase).toBe("flat");
  });

  it("conservatively resolves a same-bar stop before a target", () => {
    const q = question([bar("2026-03-23T14:30:00Z", 100, 110, 90, 100)]);
    const result = advanceEpisode(
      submitEpisode(createEpisodeState(), q, prediction("long", 100, 95, 106)).state,
      q,
      reasoned({ type: "hold" }),
    );
    expect(result).toMatchObject({ terminal: true, event: "stop_hit" });
    expect(result.result!.trades![0]).toMatchObject({ exitReason: "stop", grossR: -1 });
  });

  it("prices a same-bar stop from an intrabar entry at the stop instead of the earlier open", () => {
    const q = question([bar("2026-02-06T14:30:00Z", 98.147166, 100.917579, 97.989683, 100.284433)]);
    const result = advanceEpisode(
      submitEpisode(createEpisodeState(), q, prediction("long", 100.1, 98.6, 101.8)).state,
      q,
      reasoned({ type: "hold" }),
    );

    expect(result).toMatchObject({ terminal: true, event: "stop_hit" });
    expect(result.result!.trades![0]).toMatchObject({
      entry: { price: 100.1 },
      exit: { price: 98.6 },
      exitReason: "stop",
      grossR: -1,
    });
  });

  it("immediately closes a gap fill that has already crossed its bracket without counting later excursions", () => {
    const q = question([bar("2026-03-23T14:30:00Z", 85, 89, 80, 82)]);
    const result = advanceEpisode(
      submitEpisode(createEpisodeState(), q, prediction("short", 95, 105, 90)).state,
      q,
      reasoned({ type: "hold" }),
    );
    expect(result).toMatchObject({ terminal: true, event: "target_hit" });
    expect(result.result!.trades![0]).toMatchObject({
      entry: { price: 85 },
      exit: { price: 85 },
      exitReason: "target",
      grossR: 0,
      holdingBars: 0,
      mfeR: 0,
      maeR: 0,
    });
  });

  it("forces an open position out at the final close", () => {
    const q = question([bar("2026-03-23T14:30:00Z", 100, 103, 99, 102)]);
    const result = advanceEpisode(
      submitEpisode(createEpisodeState(), q, prediction("long", 100, 95, 120)).state,
      q,
      reasoned({ type: "hold" }),
    );
    expect(result).toMatchObject({ terminal: true, event: "horizon_exit" });
    expect(result.result).toMatchObject({ terminationReason: "horizon", tradeCount: 1, grossR: 0.4 });
    expect(result.result!.trades![0]).toMatchObject({ exitReason: "horizon", exit: { price: 102 } });
  });
});
