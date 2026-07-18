import { describe, expect, it } from "vitest";
import { aggregate, judgmentSummary } from "../../src/score/aggregate.js";
import { RUN_CONFIG_DEFAULTS } from "../../src/schema/runConfig.js";
import { mkCell } from "./helpers.js";

const WEIGHTS = RUN_CONFIG_DEFAULTS.weights;

describe("judgmentSummary arithmetic", () => {
  const cells = [
    mkCell({ outcome: "win", score: 2 }),
    mkCell({ outcome: "win", score: 2 }),
    mkCell({ outcome: "loss", score: -1 }),
    mkCell({ outcome: "timeout_flat", score: 0.5 }),
    mkCell({ outcome: "neutral_correct", direction: "neutral", score: null }),
    mkCell({ outcome: "neutral_wrong", direction: "neutral", score: null }),
    mkCell({ outcome: "no_fill", score: null }),
  ];

  it("pins winRate, expectancy, neutralAccuracy, judgment", () => {
    const s = judgmentSummary(cells, 0);
    expect(s.winRate).toBeCloseTo(0.75, 10);
    expect(s.expectancy).toBeCloseTo(0.875, 10);
    expect(s.expectancyNorm).toBeCloseTo(0.625, 10);
    expect(s.neutralAccuracy).toBeCloseTo(0.5, 10);
    expect(s.judgment).toBeCloseTo(0.65, 10);
  });

  it("timeout_flat with score <= 0 counts loss-side", () => {
    const s = judgmentSummary([mkCell({ outcome: "win", score: 2 }), mkCell({ outcome: "timeout_flat", score: -0.5 })], 0);
    expect(s.winRate).toBeCloseTo(0.5, 10);
  });
});

describe("aggregate single model", () => {
  const cells = [
    mkCell({ outcome: "win", score: 2 }),
    mkCell({ outcome: "win", score: 2 }),
    mkCell({ outcome: "loss", score: -1 }),
    mkCell({ outcome: "timeout_flat", score: 0.5 }),
    mkCell({ outcome: "neutral_correct", direction: "neutral", score: null }),
    mkCell({ outcome: "neutral_wrong", direction: "neutral", score: null }),
    mkCell({ outcome: "no_fill", score: null }),
  ];

  it("efficiency 1 for a lone model and total via weights", () => {
    const [m] = aggregate(cells, WEIGHTS);
    expect(m.efficiency).toBe(1);
    expect(m.costScore).toBe(1);
    expect(m.timeScore).toBe(1);
    expect(m.total).toBeCloseTo(0.8 * 0.65 + 0.2 * 1, 10);
    expect(m.noFillRate).toBeCloseTo(1 / 7, 10);
  });
});

describe("aggregate efficiency min-max", () => {
  function withCost(model: string, cost: number, dur: number) {
    return mkCell({ model, outcome: "win", score: 1, metrics: { durationMs: dur, costUsd: cost, toolCalls: 0 } });
  }

  it("two models split at the extremes", () => {
    const models = aggregate([withCost("a", 10, 100), withCost("b", 20, 50)], WEIGHTS);
    const a = models.find((m) => m.model === "a")!;
    const b = models.find((m) => m.model === "b")!;
    expect(a.costScore).toBe(1);
    expect(a.timeScore).toBe(0);
    expect(b.costScore).toBe(0);
    expect(b.timeScore).toBe(1);
    expect(a.efficiency).toBe(0.5);
    expect(b.efficiency).toBe(0.5);
  });

  it("three models normalize linearly", () => {
    const models = aggregate([withCost("a", 10, 10), withCost("b", 20, 20), withCost("c", 30, 30)], WEIGHTS);
    const byName = Object.fromEntries(models.map((m) => [m.model, m]));
    expect(byName.a.costScore).toBe(1);
    expect(byName.b.costScore).toBe(0.5);
    expect(byName.c.costScore).toBe(0);
    expect(byName.a.efficiency).toBe(1);
    expect(byName.b.efficiency).toBe(0.5);
    expect(byName.c.efficiency).toBe(0);
  });
});

describe("aggregate noiseDelta pairing", () => {
  it("difference of blind and live judgment over shared questions only", () => {
    const cells = [
      mkCell({ questionId: "q1", mode: "blind", outcome: "win", score: 2, r: 2 }),
      mkCell({ questionId: "q1", mode: "live", outcome: "loss", score: -1, r: 2 }),
      mkCell({ questionId: "q2", mode: "blind", outcome: "loss", score: -1, r: 2 }),
    ];
    const [m] = aggregate(cells, WEIGHTS);
    expect(m.noiseDelta).toBeCloseTo(0.8, 10);
  });

  it("null noiseDelta when no question appears in both modes", () => {
    const [m] = aggregate([mkCell({ questionId: "q1", mode: "blind" })], WEIGHTS);
    expect(m.noiseDelta).toBeNull();
  });
});

describe("aggregate consistency", () => {
  it("share of repeat groups that disagree on direction", () => {
    const cells = [
      mkCell({ questionId: "q1", mode: "blind", rep: 0, direction: "long" }),
      mkCell({ questionId: "q1", mode: "blind", rep: 1, direction: "short" }),
      mkCell({ questionId: "q2", mode: "blind", rep: 0, direction: "long" }),
      mkCell({ questionId: "q2", mode: "blind", rep: 1, direction: "long" }),
    ];
    const [m] = aggregate(cells, WEIGHTS);
    expect(m.consistency).toBeCloseTo(0.5, 10);
  });
});

describe("aggregate reference models", () => {
  it("scores baseline/gold on judgment alone and gives them null efficiency", () => {
    const cells = [
      mkCell({ model: "real/model", outcome: "win", score: 1, metrics: { durationMs: 100, costUsd: 0.02, toolCalls: 0 } }),
      mkCell({ model: "baseline/buy-hold", outcome: "win", score: 1, metrics: { durationMs: 0, costUsd: 0, toolCalls: 0 } }),
      mkCell({ model: "gold/hindsight", outcome: "win", score: 1, metrics: { durationMs: 0, costUsd: 0, toolCalls: 0 } }),
    ];
    const models = aggregate(cells, WEIGHTS);
    const real = models.find((m) => m.model === "real/model")!;
    const base = models.find((m) => m.model === "baseline/buy-hold")!;
    const gold = models.find((m) => m.model === "gold/hindsight")!;
    expect(real.efficiency).toBe(1);
    expect(base.efficiency).toBeNull();
    expect(base.costScore).toBeNull();
    expect(base.timeScore).toBeNull();
    expect(base.total).toBeCloseTo(base.judgment, 10);
    expect(gold.efficiency).toBeNull();
    expect(gold.total).toBeCloseTo(gold.judgment, 10);
  });

  it("keeps a zero-cost baseline out of the min-max efficiency pool", () => {
    const cells = [
      mkCell({ model: "a", outcome: "win", score: 1, metrics: { durationMs: 100, costUsd: 0.01, toolCalls: 0 } }),
      mkCell({ model: "b", outcome: "win", score: 1, metrics: { durationMs: 200, costUsd: 0.02, toolCalls: 0 } }),
      mkCell({ model: "baseline/buy-hold", outcome: "win", score: 1, metrics: { durationMs: 0, costUsd: 0, toolCalls: 0 } }),
    ];
    const models = aggregate(cells, WEIGHTS);
    const a = models.find((m) => m.model === "a")!;
    const b = models.find((m) => m.model === "b")!;
    expect(a.costScore).toBe(1);
    expect(b.costScore).toBe(0);
  });

  it("excludes api_error cells from mean cost and duration", () => {
    const cells = [
      mkCell({ model: "a", outcome: "win", score: 1, metrics: { durationMs: 100, costUsd: 0.02, toolCalls: 0 } }),
      mkCell({
        model: "a",
        outcome: "api_error",
        direction: null,
        entry: null,
        stop: null,
        target: null,
        score: null,
        r: null,
        metrics: { durationMs: 0, costUsd: 0, toolCalls: 0 },
      }),
    ];
    const [m] = aggregate(cells, WEIGHTS);
    expect(m.meanCostUsd).toBeCloseTo(0.02, 10);
    expect(m.meanDurationMs).toBeCloseTo(100, 10);
  });
});

describe("abstainRate", () => {
  it("counts neutral cells over all scored cells, excluding api_error", () => {
    const cells = [
      mkCell({ outcome: "win", score: 1 }),
      mkCell({ outcome: "loss", score: -1 }),
      mkCell({ outcome: "neutral_correct", direction: "neutral", score: null }),
      mkCell({ outcome: "neutral_wrong", direction: "neutral", score: null }),
      mkCell({
        outcome: "api_error",
        direction: null,
        entry: null,
        stop: null,
        target: null,
        score: null,
        r: null,
      }),
    ];
    const s = judgmentSummary(cells, 0);
    expect(s.abstainRate).toBeCloseTo(2 / 4, 10);
  });

  it("is 0 when a model never abstains", () => {
    const s = judgmentSummary([mkCell({ outcome: "win", score: 1 }), mkCell({ outcome: "loss", score: -1 })], 0);
    expect(s.abstainRate).toBe(0);
  });

  it("is 0 when there are no scored cells at all", () => {
    const s = judgmentSummary(
      [
        mkCell({
          outcome: "api_error",
          direction: null,
          entry: null,
          stop: null,
          target: null,
          score: null,
          r: null,
        }),
      ],
      0,
    );
    expect(s.abstainRate).toBe(0);
  });
});

describe("avgWinnerR", () => {
  it("is null when a model has zero wins", () => {
    const [m] = aggregate([mkCell({ outcome: "loss", score: -1 })], WEIGHTS);
    expect(m.avgWinnerR).toBeNull();
  });

  it("equals the single winning score when there is exactly one win", () => {
    const [m] = aggregate([mkCell({ outcome: "win", score: 2.5 }), mkCell({ outcome: "loss", score: -1 })], WEIGHTS);
    expect(m.avgWinnerR).toBeCloseTo(2.5, 10);
  });

  it("averages score over wins only, ignoring losses and neutrals", () => {
    const [m] = aggregate(
      [
        mkCell({ outcome: "win", score: 2 }),
        mkCell({ outcome: "win", score: 4 }),
        mkCell({ outcome: "loss", score: -1 }),
        mkCell({ outcome: "neutral_correct", direction: "neutral", score: null }),
      ],
      WEIGHTS,
    );
    expect(m.avgWinnerR).toBeCloseTo(3, 10);
  });
});

describe("aggregate neutral median substitution", () => {
  it("a model with no neutral cells inherits the run median neutralAccuracy", () => {
    const cells = [
      mkCell({ model: "a", outcome: "neutral_correct", direction: "neutral", score: null }),
      mkCell({ model: "a", outcome: "neutral_wrong", direction: "neutral", score: null }),
      mkCell({ model: "b", outcome: "win", score: 1 }),
    ];
    const models = aggregate(cells, WEIGHTS);
    const b = models.find((m) => m.model === "b")!;
    expect(b.neutralAccuracy).toBeCloseTo(0.5, 10);
  });
});
