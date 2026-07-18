import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { goldSubmissionFor, runGold } from "../../src/score/gold.js";
import { scoreCell } from "../../src/score/cell.js";
import { bar, buildQuestion, flatDayBars } from "./helpers.js";
import type { Question } from "../../src/schema/question.js";

const dayBars = flatDayBars(15, 110, 100, 105);

function risingQuestion(id: string): Question {
  return buildQuestion({
    id,
    dayBars,
    replayBars: [bar(108, 102, 106), bar(130, 120, 128), bar(135, 125, 132)],
  });
}

function tightQuestion(id: string): Question {
  return buildQuestion({
    id,
    dayBars,
    replayBars: [bar(108, 102, 106), bar(112, 104, 110), bar(111, 99, 108)],
  });
}

describe("goldSubmissionFor", () => {
  it("picks the hindsight-optimal long that scores a win", () => {
    const q = risingQuestion("swing-TEST-01");
    const sub = goldSubmissionFor(q);
    expect(sub.direction).toBe("long");
    expect(sub.entry_plan).toMatchObject({ entry: 105, stop: 95, target1: 135 });
    const verdict = scoreCell({
      questionId: q.id,
      model: "gold/hindsight",
      mode: "blind",
      rep: 0,
      status: "completed",
      submission: sub,
      metrics: { durationMs: 0, costUsd: 0, toolCalls: 0, inputTokens: 0, outputTokens: 0 },
      traceRef: "",
    }, q);
    expect(verdict.outcome).toBe("win");
    expect(verdict.score).toBeCloseTo(3, 10);
    expect(verdict.direction).toBe("long");
    expect(verdict.entry).toBe(105);
    expect(verdict.stop).toBe(95);
    expect(verdict.target).toBe(135);
  });
});

describe("runGold", () => {
  let root: string;
  let datasetsRoot: string;
  let resultsRoot: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), "bench-gold-"));
    datasetsRoot = join(root, "datasets");
    resultsRoot = join(root, "results");
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  async function writeQuestions(version: string, questions: Question[]): Promise<void> {
    const dir = join(datasetsRoot, version, "swing");
    await fs.mkdir(dir, { recursive: true });
    for (const q of questions) await fs.writeFile(join(dir, `${q.id}.json`), JSON.stringify(q), "utf8");
  }

  it("--check passes when hindsight golds clear the floor", async () => {
    await writeQuestions("v1", [risingQuestion("swing-A"), risingQuestion("swing-B")]);
    const result = await runGold({ datasetVersion: "v1", datasetsRoot, resultsRoot, check: true });
    expect(result.directionalFraction).toBe(1);
    expect(result.aggregate?.winRate).toBe(1);
    expect(result.aggregate?.expectancy).toBeGreaterThanOrEqual(1);
    expect(result.passed).toBe(true);
    const written = await fs.readFile(join(resultsRoot, "gold-v1", "predictions.jsonl"), "utf8");
    expect(written.trim().split("\n")).toHaveLength(2);
  });

  it("--check fails naming expectancy when golds win small", async () => {
    await writeQuestions("v1", [tightQuestion("swing-A"), tightQuestion("swing-B")]);
    const result = await runGold({ datasetVersion: "v1", datasetsRoot, resultsRoot, check: true });
    expect(result.aggregate?.winRate).toBe(1);
    expect(result.passed).toBe(false);
    expect(result.failures.join(" ")).toContain("expectancy");
  });
});
