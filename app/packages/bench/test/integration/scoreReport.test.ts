import { mkdtempSync, promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Value } from "typebox/value";
import { beforeAll, describe, expect, it } from "vitest";
import { type ReportConfigSnapshot, renderReport } from "../../src/report/render.js";
import { reportSummarySchema } from "../../src/schema/reportSummary.js";
import { runScore } from "../../src/score/score.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATASETS = join(HERE, "..", "fixtures", "datasets");
const FIXTURE = join(HERE, "..", "fixtures", "predictions", "predictions.jsonl");
const DATASET_VERSION = "integration-v1";
const BANK = "swing";
const MODELS = ["alpha/one", "beta/two"];
const QUESTION_IDS = ["swing-AAPL-2026-01-02-01", "swing-MU-2026-01-02-01", "swing-NVDA-2026-01-02-01"];

describe("score + report integration on the minimal fixture dataset", () => {
  const root = mkdtempSync(join(tmpdir(), "bench-int-"));
  const resultsRoot = join(root, "results");
  const runId = "run-int";
  const runDir = join(resultsRoot, runId);
  const config: ReportConfigSnapshot = {
    runId,
    startedAt: "2026-07-17T00:00:00Z",
    datasetVersion: DATASET_VERSION,
    bank: BANK,
    gitSha: "int-sha",
    modes: ["blind"],
  };

  let scores: Awaited<ReturnType<typeof runScore>>;

  beforeAll(async () => {
    await fs.mkdir(runDir, { recursive: true });
    await fs.copyFile(FIXTURE, join(runDir, "predictions.jsonl"));
    await fs.writeFile(join(runDir, "config.json"), `${JSON.stringify(config, null, 2)}\n`, "utf8");
    scores = await runScore({ runId, datasetVersion: DATASET_VERSION, resultsRoot, datasetsRoot: DATASETS, bank: BANK });
  });

  it("scores every fixture prediction against the fixture dataset", () => {
    expect(scores.cells).toHaveLength(MODELS.length * QUESTION_IDS.length);
    for (const model of MODELS) {
      expect(scores.models.some((entry) => entry.model === model)).toBe(true);
    }
    for (const cell of scores.cells) {
      expect(QUESTION_IDS).toContain(cell.questionId);
    }
  });

  it("renders a leaderboard that lists both models, drills into each question, and validates the summary", () => {
    const { markdown, summary } = renderReport(scores, config);
    for (const model of MODELS) expect(markdown).toContain(model);
    for (const id of QUESTION_IDS) expect(markdown).toContain(`### ${id}`);
    expect(Value.Check(reportSummarySchema, summary)).toBe(true);
    expect(summary.ranking.length).toBe(MODELS.length);
    expect(summary.ranking[0].total).toBeGreaterThanOrEqual(summary.ranking[summary.ranking.length - 1].total);
  });
});
