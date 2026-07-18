import { describe, expect, it } from "vitest";
import { agreementMatrixOf, difficultyTiersOf } from "../../src/score/analysis.js";
import type { CellVerdict } from "../../src/score/cell.js";
import { mkCell } from "./helpers.js";

describe("difficultyTiersOf", () => {
  it("classifies a 3-model x 4-question grid into all-correct, all-wrong, split, and n=1", () => {
    const cells: CellVerdict[] = [
      mkCell({ model: "a", questionId: "q-all-correct", outcome: "win", score: 1 }),
      mkCell({ model: "b", questionId: "q-all-correct", outcome: "win", score: 2 }),
      mkCell({ model: "c", questionId: "q-all-correct", outcome: "win", score: 1 }),

      mkCell({ model: "a", questionId: "q-all-wrong", outcome: "loss", score: -1 }),
      mkCell({ model: "b", questionId: "q-all-wrong", outcome: "loss", score: -1 }),
      mkCell({ model: "c", questionId: "q-all-wrong", outcome: "loss", score: -1 }),

      mkCell({ model: "a", questionId: "q-split", outcome: "win", score: 1 }),
      mkCell({ model: "b", questionId: "q-split", outcome: "loss", score: -1 }),
      mkCell({ model: "c", questionId: "q-split", outcome: "loss", score: -1 }),

      mkCell({ model: "a", questionId: "q-solo-correct", outcome: "win", score: 3 }),

      mkCell({
        model: "baseline/buy-hold",
        questionId: "q-all-correct",
        outcome: "loss",
        score: -1,
      }),
    ];

    const tiers = difficultyTiersOf(cells);

    expect(tiers.allCorrect.map((e) => e.questionId)).toEqual(["q-all-correct", "q-solo-correct"]);
    expect(tiers.allWrong.map((e) => e.questionId)).toEqual(["q-all-wrong"]);
    expect(tiers.split.map((e) => e.questionId)).toEqual(["q-split"]);

    const allCorrect = tiers.allCorrect.find((e) => e.questionId === "q-all-correct")!;
    expect(allCorrect.nModels).toBe(3);
    expect(allCorrect.meanScore).toBeCloseTo((1 + 2 + 1) / 3, 10);

    const solo = tiers.allCorrect.find((e) => e.questionId === "q-solo-correct")!;
    expect(solo.nModels).toBe(1);
  });

  it("treats a fully api_error model as not having answered, so it doesn't count", () => {
    const cells: CellVerdict[] = [
      mkCell({ model: "a", questionId: "q1", outcome: "win", score: 1 }),
      mkCell({
        model: "b",
        questionId: "q1",
        outcome: "api_error",
        direction: null,
        entry: null,
        stop: null,
        target: null,
        score: null,
        r: null,
      }),
    ];
    const tiers = difficultyTiersOf(cells);
    const entry = tiers.allCorrect.find((e) => e.questionId === "q1");
    expect(entry?.nModels).toBe(1);
  });

  it("treats a neutral_wrong verdict as incorrect and neutral_correct as correct", () => {
    const cells: CellVerdict[] = [
      mkCell({ model: "a", questionId: "q1", direction: "neutral", outcome: "neutral_correct", score: null, r: null }),
      mkCell({ model: "b", questionId: "q1", direction: "neutral", outcome: "neutral_wrong", score: null, r: null }),
    ];
    const tiers = difficultyTiersOf(cells);
    expect(tiers.split.map((e) => e.questionId)).toEqual(["q1"]);
  });
});

describe("agreementMatrixOf", () => {
  it("computes a pinned agreement rate for two models over 6 shared questions", () => {
    const cells: CellVerdict[] = [];
    const agreeIds = ["q1", "q2", "q3", "q4"];
    const disagreeIds = ["q5", "q6"];
    for (const id of agreeIds) {
      cells.push(
        mkCell({ model: "a", questionId: id, mode: "blind", direction: "long" }),
        mkCell({ model: "b", questionId: id, mode: "blind", direction: "long" }),
      );
    }
    for (const id of disagreeIds) {
      cells.push(
        mkCell({ model: "a", questionId: id, mode: "blind", direction: "long" }),
        mkCell({ model: "b", questionId: id, mode: "blind", direction: "short" }),
      );
    }
    const matrix = agreementMatrixOf(cells);
    expect(matrix.models).toEqual(["a", "b"]);
    const pair = matrix.pairs.find((p) => p.a === "a" && p.b === "b")!;
    expect(pair.sharedCount).toBe(6);
    expect(pair.agreementRate).toBeCloseTo(4 / 6, 10);
  });

  it("combines reps by majority direction and counts a tie as disagreement", () => {
    const cells: CellVerdict[] = [];
    for (let i = 0; i < 5; i++) {
      cells.push(mkCell({ model: "a", questionId: `q${i}`, mode: "blind", rep: 0, direction: "long" }));
      cells.push(mkCell({ model: "b", questionId: `q${i}`, mode: "blind", rep: 0, direction: "long" }));
    }
    cells.push(mkCell({ model: "a", questionId: "q-tie", mode: "blind", rep: 0, direction: "long" }));
    cells.push(mkCell({ model: "a", questionId: "q-tie", mode: "blind", rep: 1, direction: "short" }));
    cells.push(mkCell({ model: "b", questionId: "q-tie", mode: "blind", rep: 0, direction: "long" }));

    const matrix = agreementMatrixOf(cells);
    const pair = matrix.pairs.find((p) => p.a === "a" && p.b === "b")!;
    expect(pair.sharedCount).toBe(6);
    expect(pair.agreementRate).toBeCloseTo(5 / 6, 10);
  });

  it("suppresses the agreement rate (nulls it) below 5 shared questions", () => {
    const cells: CellVerdict[] = [
      mkCell({ model: "a", questionId: "q1", mode: "blind", direction: "long" }),
      mkCell({ model: "b", questionId: "q1", mode: "blind", direction: "long" }),
      mkCell({ model: "a", questionId: "q2", mode: "blind", direction: "long" }),
      mkCell({ model: "b", questionId: "q2", mode: "blind", direction: "long" }),
    ];
    const matrix = agreementMatrixOf(cells);
    const pair = matrix.pairs.find((p) => p.a === "a" && p.b === "b")!;
    expect(pair.sharedCount).toBe(2);
    expect(pair.agreementRate).toBeNull();
  });

  it("excludes baseline and gold rows from the matrix", () => {
    const cells: CellVerdict[] = [
      mkCell({ model: "a", questionId: "q1", mode: "blind", direction: "long" }),
      mkCell({ model: "baseline/buy-hold", questionId: "q1", mode: "blind", direction: "long" }),
      mkCell({ model: "gold/hindsight", questionId: "q1", mode: "blind", direction: "long" }),
    ];
    const matrix = agreementMatrixOf(cells);
    expect(matrix.models).toEqual(["a"]);
    expect(matrix.pairs).toHaveLength(0);
  });

  it("only compares the same mode: blind and live cells for the same question don't count as shared", () => {
    const cells: CellVerdict[] = [
      mkCell({ model: "a", questionId: "q1", mode: "blind", direction: "long" }),
      mkCell({ model: "b", questionId: "q1", mode: "live", direction: "long" }),
    ];
    const matrix = agreementMatrixOf(cells);
    const pair = matrix.pairs.find((p) => p.a === "a" && p.b === "b")!;
    expect(pair.sharedCount).toBe(0);
    expect(pair.agreementRate).toBeNull();
  });
});
