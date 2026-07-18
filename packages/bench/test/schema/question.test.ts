import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Value } from "typebox/value";
import { questionSchema, type Question, type RunnerQuestion } from "../../src/schema/question.js";

const fixturePath = fileURLToPath(
  new URL("../fixtures/datasets/v1/swing/swing-TEST-01.json", import.meta.url),
);
const validQuestionFixture = JSON.parse(readFileSync(fixturePath, "utf8")) as Record<string, unknown>;

describe("questionSchema", () => {
  it("accepts a valid question fixture", () => {
    expect(Value.Check(questionSchema, validQuestionFixture)).toBe(true);
  });

  it("rejects a question missing cutoff", () => {
    const { cutoff: _cutoff, ...withoutCutoff } = validQuestionFixture;
    expect(Value.Check(questionSchema, withoutCutoff)).toBe(false);
  });

  it("rejects a question with an unknown top-level key", () => {
    const withExtraKey = { ...validQuestionFixture, unexpectedTopLevelField: true };
    expect(Value.Check(questionSchema, withExtraKey)).toBe(false);
  });

  it("RunnerQuestion type rejects access to replay at compile time", () => {
    const runnerQuestion = validQuestionFixture as unknown as RunnerQuestion;
    // @ts-expect-error replay is structurally absent from RunnerQuestion
    expect(runnerQuestion.replay).toBeDefined();
  });

  it("Question type still has replay", () => {
    const question = validQuestionFixture as unknown as Question;
    expect(question.replay).toBeDefined();
  });
});
