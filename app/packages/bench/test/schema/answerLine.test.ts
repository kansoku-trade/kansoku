import { describe, expect, it } from "vitest";
import { Value } from "typebox/value";
import { answerLineSchema } from "../../src/schema/answerLine.js";

const validSubmission = {
  direction: "long" as const,
  anchor: { timeframe: "h1" as const, time: "2026-03-20T20:00:00-04:00", price: 102 },
  scenarios: [
    { label: "breakout", probability: 60 },
    { label: "fade", probability: 40 },
  ],
  comment: "跟随趋势做多",
};

function baseAnswerLine(overrides: Record<string, unknown> = {}) {
  return {
    questionId: "swing-TEST-01",
    model: "anthropic/claude-sonnet-5",
    mode: "blind",
    rep: 0,
    status: "completed",
    submission: validSubmission,
    metrics: { durationMs: 12000, costUsd: 0.05, toolCalls: 4, inputTokens: 5000, outputTokens: 300 },
    traceRef: "results/run-1/anthropic-claude-sonnet-5/swing-TEST-01/blind-0.jsonl",
    ...overrides,
  };
}

describe("answerLineSchema", () => {
  it("accepts a completed answer line with a submission", () => {
    expect(Value.Check(answerLineSchema, baseAnswerLine())).toBe(true);
  });

  it("accepts a non-completed answer line with a null submission", () => {
    expect(
      Value.Check(answerLineSchema, baseAnswerLine({ status: "timeout", submission: null })),
    ).toBe(true);
  });

  it("rejects an unknown top-level key", () => {
    expect(Value.Check(answerLineSchema, baseAnswerLine({ extraField: true }))).toBe(false);
  });

  it("rejects an invalid status", () => {
    expect(Value.Check(answerLineSchema, baseAnswerLine({ status: "bogus" }))).toBe(false);
  });
});
