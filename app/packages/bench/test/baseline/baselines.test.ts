import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadQuestionForRunner } from "../../src/dataset/loader.js";
import { buildBaselineAnswer, cutoffClose } from "../../src/baseline/baselines.js";
import type { RunnerQuestion } from "../../src/schema/question.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATASETS = join(HERE, "..", "fixtures", "datasets");

async function fixture(): Promise<RunnerQuestion> {
  return loadQuestionForRunner(DATASETS, "v1", "swing", "swing-TEST-01");
}

describe("baselines", () => {
  it("reads the cutoff close from quote.last", async () => {
    expect(cutoffClose(await fixture())).toBe(102);
  });

  it("buy-hold is a long with 8%/16% stop and target", async () => {
    const answer = buildBaselineAnswer("buy-hold", await fixture(), "blind");
    expect(answer.model).toBe("baseline/buy-hold");
    expect(answer.status).toBe("completed");
    expect(answer.metrics).toEqual({ durationMs: 0, costUsd: 0, toolCalls: 0, inputTokens: 0, outputTokens: 0 });
    expect(answer.submission).toMatchObject({
      direction: "long",
      anchor: { timeframe: "day", price: 102 },
      entry_plan: { entry: 102, stop: 93.84, target1: 118.32 },
    });
  });

  it("coin-flip mirrors stops for the short side when the id char-sum is odd", async () => {
    const answer = buildBaselineAnswer("coin-flip", await fixture(), "blind");
    expect(answer.submission).toMatchObject({
      direction: "short",
      entry_plan: { entry: 102, stop: 110.16, target1: 85.68 },
    });
    const again = buildBaselineAnswer("coin-flip", await fixture(), "blind");
    expect(again.submission).toEqual(answer.submission);
  });

  it("always-neutral gives a neutral range without an entry plan", async () => {
    const answer = buildBaselineAnswer("always-neutral", await fixture(), "live");
    expect(answer.submission?.direction).toBe("neutral");
    expect(answer.submission?.entry_plan).toBeUndefined();
    expect(answer.submission?.range_plan).toEqual({ low: 98.94, high: 105.06 });
  });
});
