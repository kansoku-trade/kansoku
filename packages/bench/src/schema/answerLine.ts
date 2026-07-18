import { type Static, Type } from "typebox";
import { submissionSchema } from "./submission.js";

const metricsSchema = Type.Object(
  {
    durationMs: Type.Number(),
    costUsd: Type.Number(),
    toolCalls: Type.Integer({ minimum: 0 }),
    inputTokens: Type.Integer({ minimum: 0 }),
    outputTokens: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export const answerLineSchema = Type.Object(
  {
    questionId: Type.String(),
    model: Type.String(),
    mode: Type.Union([Type.Literal("blind"), Type.Literal("live")]),
    rep: Type.Integer({ minimum: 0 }),
    status: Type.Union([
      Type.Literal("completed"),
      Type.Literal("format_violation"),
      Type.Literal("timeout"),
      Type.Literal("api_error"),
    ]),
    submission: Type.Union([submissionSchema, Type.Null()]),
    metrics: metricsSchema,
    traceRef: Type.String(),
  },
  { additionalProperties: false },
);

export type AnswerLine = Static<typeof answerLineSchema>;
