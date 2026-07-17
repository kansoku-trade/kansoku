import { type Static, Type } from "typebox";
import { weightsSchema } from "./runConfig.js";

const cellMetricsSchema = Type.Object(
  {
    durationMs: Type.Number(),
    costUsd: Type.Number(),
    toolCalls: Type.Number(),
  },
  { additionalProperties: false },
);

export const cellVerdictSchema = Type.Object(
  {
    model: Type.String(),
    questionId: Type.String(),
    mode: Type.Union([Type.Literal("blind"), Type.Literal("live")]),
    rep: Type.Integer({ minimum: 0 }),
    symbol: Type.String(),
    layer: Type.String(),
    regime: Type.Union([Type.Literal("up"), Type.Literal("down")]),
    direction: Type.Union([
      Type.Literal("long"),
      Type.Literal("short"),
      Type.Literal("neutral"),
      Type.Null(),
    ]),
    entry: Type.Union([Type.Number(), Type.Null()]),
    stop: Type.Union([Type.Number(), Type.Null()]),
    target: Type.Union([Type.Number(), Type.Null()]),
    outcome: Type.Union([
      Type.Literal("win"),
      Type.Literal("loss"),
      Type.Literal("timeout_flat"),
      Type.Literal("no_fill"),
      Type.Literal("format_violation"),
      Type.Literal("neutral_correct"),
      Type.Literal("neutral_wrong"),
      Type.Literal("api_error"),
      Type.Literal("agent_timeout"),
    ]),
    score: Type.Union([Type.Number(), Type.Null()]),
    r: Type.Union([Type.Number(), Type.Null()]),
    traceRef: Type.Union([Type.String(), Type.Null()]),
    metrics: cellMetricsSchema,
  },
  { additionalProperties: false },
);

const judgmentSummarySchema = Type.Object(
  {
    cellCount: Type.Number(),
    winRate: Type.Number(),
    expectancy: Type.Number(),
    expectancyNorm: Type.Number(),
    neutralAccuracy: Type.Number(),
    judgment: Type.Number(),
    abstainRate: Type.Number(),
  },
  { additionalProperties: false },
);

const modelAggregateSchema = Type.Object(
  {
    model: Type.String(),
    cellCount: Type.Number(),
    winRate: Type.Number(),
    expectancy: Type.Number(),
    expectancyNorm: Type.Number(),
    neutralAccuracy: Type.Number(),
    judgment: Type.Number(),
    abstainRate: Type.Number(),
    noFillRate: Type.Number(),
    formatViolationRate: Type.Number(),
    timeoutRate: Type.Number(),
    apiErrorRate: Type.Number(),
    costScore: Type.Union([Type.Number(), Type.Null()]),
    timeScore: Type.Union([Type.Number(), Type.Null()]),
    efficiency: Type.Union([Type.Number(), Type.Null()]),
    total: Type.Number(),
    meanCostUsd: Type.Number(),
    meanDurationMs: Type.Number(),
    toolCalls: Type.Object(
      { mean: Type.Number(), p50: Type.Number(), p90: Type.Number() },
      { additionalProperties: false },
    ),
    noiseDelta: Type.Union([Type.Number(), Type.Null()]),
    consistency: Type.Number(),
    avgWinnerR: Type.Union([Type.Number(), Type.Null()]),
    modes: Type.Record(Type.String(), judgmentSummarySchema),
    layers: Type.Record(Type.String(), judgmentSummarySchema),
    regimes: Type.Record(Type.String(), judgmentSummarySchema),
  },
  { additionalProperties: false },
);

const questionDifficultyEntrySchema = Type.Object(
  {
    questionId: Type.String(),
    nModels: Type.Number(),
    meanScore: Type.Union([Type.Number(), Type.Null()]),
  },
  { additionalProperties: false },
);

const difficultyTiersSchema = Type.Object(
  {
    allCorrect: Type.Array(questionDifficultyEntrySchema),
    allWrong: Type.Array(questionDifficultyEntrySchema),
    split: Type.Array(questionDifficultyEntrySchema),
  },
  { additionalProperties: false },
);

const agreementPairSchema = Type.Object(
  {
    a: Type.String(),
    b: Type.String(),
    sharedCount: Type.Number(),
    agreementRate: Type.Union([Type.Number(), Type.Null()]),
  },
  { additionalProperties: false },
);

const agreementMatrixSchema = Type.Object(
  {
    models: Type.Array(Type.String()),
    pairs: Type.Array(agreementPairSchema),
  },
  { additionalProperties: false },
);

const analysisSchema = Type.Object(
  {
    difficultyTiers: difficultyTiersSchema,
    agreementMatrix: agreementMatrixSchema,
  },
  { additionalProperties: false },
);

export const scoresSchema = Type.Object(
  {
    runId: Type.String(),
    datasetVersion: Type.String(),
    weights: weightsSchema,
    cells: Type.Array(cellVerdictSchema),
    models: Type.Array(modelAggregateSchema),
    analysis: analysisSchema,
  },
  { additionalProperties: false },
);

export type Scores = Static<typeof scoresSchema>;
