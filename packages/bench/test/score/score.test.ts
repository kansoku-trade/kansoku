import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dedupePredictions } from "../../src/score/predictions.js";
import { runScore } from "../../src/score/score.js";
import { bar, buildQuestion, directionalAnswer, flatDayBars } from "./helpers.js";
import type { AnswerLine } from "../../src/schema/answerLine.js";

describe("dedupePredictions", () => {
  it("takes the last line per (model, question, mode, rep) key", () => {
    const stale: AnswerLine = {
      questionId: "q1",
      model: "m1",
      mode: "blind",
      rep: 0,
      status: "api_error",
      submission: null,
      metrics: { durationMs: 0, costUsd: 0, toolCalls: 0, inputTokens: 0, outputTokens: 0 },
      traceRef: "",
    };
    const retried = { ...stale, status: "completed" as const };
    const lines = [JSON.stringify(stale), JSON.stringify(retried)];
    const deduped = dedupePredictions(lines);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].status).toBe("completed");
  });

  it("skips unparseable trailing partial lines", () => {
    const good = JSON.stringify(directionalAnswer({ direction: "long", entry: 100, stop: 90, target: 120 }));
    const deduped = dedupePredictions([good, '{"questionId":"partial']);
    expect(deduped).toHaveLength(1);
  });
});

describe("runScore integration", () => {
  let root: string;
  let datasetsRoot: string;
  let resultsRoot: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), "bench-score-"));
    datasetsRoot = join(root, "datasets");
    resultsRoot = join(root, "results");
    const dir = join(datasetsRoot, "v1", "swing");
    await fs.mkdir(dir, { recursive: true });
    const question = buildQuestion({
      id: "swing-TEST-01",
      dayBars: flatDayBars(15, 110, 100, 105),
      replayBars: [bar(108, 102, 106), bar(130, 120, 128), bar(135, 125, 132)],
    });
    await fs.writeFile(join(dir, "swing-TEST-01.json"), JSON.stringify(question), "utf8");
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("dedups, scores, and writes a validated scores.json", async () => {
    const runDir = join(resultsRoot, "run-x");
    await fs.mkdir(runDir, { recursive: true });
    const stale = { ...directionalAnswer({ direction: "long", entry: 105, stop: 95, target: 135 }), status: "api_error" as const };
    const good = directionalAnswer({ direction: "long", entry: 105, stop: 95, target: 135 });
    const lines = [JSON.stringify(stale), JSON.stringify(good), '{"partial'];
    await fs.writeFile(join(runDir, "predictions.jsonl"), `${lines.join("\n")}\n`, "utf8");

    const scores = await runScore({ runId: "run-x", datasetVersion: "v1", resultsRoot, datasetsRoot });
    expect(scores.cells).toHaveLength(1);
    expect(scores.cells[0].outcome).toBe("win");
    expect(scores.cells[0].direction).toBe("long");
    expect(scores.cells[0].entry).toBe(105);
    expect(scores.cells[0].stop).toBe(95);
    expect(scores.cells[0].target).toBe(135);
    expect(scores.models[0].winRate).toBe(1);

    const onDisk = JSON.parse(await fs.readFile(join(runDir, "scores.json"), "utf8"));
    expect(onDisk.models[0].model).toBe("m1");
  });
});
