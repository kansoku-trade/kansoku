import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DatasetValidationError,
  listQuestions,
  loadQuestionFile,
  loadQuestionForRunner,
  loadQuestionForScorer,
} from "../../src/dataset/loader.js";

const fixturesRoot = fileURLToPath(new URL("../fixtures/datasets", import.meta.url));
const malformedMissingCutoffFile = fileURLToPath(
  new URL("../fixtures/malformed-missing-cutoff.json", import.meta.url),
);
const malformedExtraKeyFile = fileURLToPath(new URL("../fixtures/malformed-extra-key.json", import.meta.url));

describe("dataset loader", () => {
  it("lists question ids in a bank directory", async () => {
    const ids = await listQuestions(fixturesRoot, "v1", "swing");
    expect(ids).toEqual(["swing-TEST-01"]);
  });

  it("loadQuestionForScorer returns the full validated question including replay", async () => {
    const question = await loadQuestionForScorer(fixturesRoot, "v1", "swing", "swing-TEST-01");
    expect(question.id).toBe("swing-TEST-01");
    expect(question.replay.bars.length).toBe(1);
    expect(question.replay.horizonBars).toBe(20);
  });

  it("loadQuestionForRunner strips replay as an own property", async () => {
    const runnerQuestion = await loadQuestionForRunner(fixturesRoot, "v1", "swing", "swing-TEST-01");
    expect(Object.prototype.hasOwnProperty.call(runnerQuestion, "replay")).toBe(false);
    expect(runnerQuestion.id).toBe("swing-TEST-01");
    expect(runnerQuestion.fixtures.kline.day.length).toBe(2);
  });

  it("rejects a malformed fixture missing cutoff, naming the file and failing path", async () => {
    await expect(loadQuestionFile(malformedMissingCutoffFile)).rejects.toThrow(DatasetValidationError);
    await expect(loadQuestionFile(malformedMissingCutoffFile)).rejects.toThrow(/malformed-missing-cutoff\.json/);
    await expect(loadQuestionFile(malformedMissingCutoffFile)).rejects.toThrow(/cutoff/);
  });

  it("rejects a fixture with an unknown top-level key", async () => {
    await expect(loadQuestionFile(malformedExtraKeyFile)).rejects.toThrow(DatasetValidationError);
    await expect(loadQuestionFile(malformedExtraKeyFile)).rejects.toThrow(/malformed-extra-key\.json/);
  });
});
