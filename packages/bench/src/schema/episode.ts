import { type Static, Type } from 'typebox';
import { submissionSchema } from './submission.js';
import { episodeTradeReasonSchema } from './tradeReason.js';

const nullableNumber = Type.Union([Type.Number(), Type.Null()]);

const requiredReason = { reason: episodeTradeReasonSchema };
const optionalReason = { reason: Type.Optional(episodeTradeReasonSchema) };

const positionSizeSchema = Type.Number({ exclusiveMinimum: 0, maximum: 1 });

const advancePeriodSchema = Type.Union([
  Type.Literal('h1'),
  Type.Literal('1m'),
  Type.Literal('5m'),
  Type.Literal('15m'),
  Type.Literal('30m'),
  Type.Literal('1h'),
  Type.Literal('day'),
  Type.Literal('week'),
]);

export const episodeSubmissionSchema = Type.Object(
  {
    ...submissionSchema.properties,
    decision_reason: episodeTradeReasonSchema,
  },
  { additionalProperties: false },
);

export type EpisodeSubmission = Static<typeof episodeSubmissionSchema>;

export const episodeTradeActionSchema = Type.Union([
  Type.Object(
    {
      type: Type.Literal('hold'),
      bars: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
      period: Type.Optional(advancePeriodSchema),
      ...optionalReason,
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      type: Type.Literal('amend'),
      stop: Type.Optional(Type.Number()),
      target: Type.Optional(Type.Number()),
      ...requiredReason,
    },
    { additionalProperties: false },
  ),
  Type.Object({ type: Type.Literal('cancel'), ...requiredReason }, { additionalProperties: false }),
  Type.Object(
    { type: Type.Literal('exit_next_open'), ...requiredReason },
    { additionalProperties: false },
  ),
  Type.Object(
    { type: Type.Literal('add'), size: positionSizeSchema, ...requiredReason },
    { additionalProperties: false },
  ),
  Type.Object(
    { type: Type.Literal('reduce'), size: Type.Optional(positionSizeSchema), ...requiredReason },
    { additionalProperties: false },
  ),
]);

export type EpisodeTradeAction = Static<typeof episodeTradeActionSchema>;

// Wire shape for the advance_trade tool. OpenAI-compatible function schemas must have a single
// top-level `type: "object"` — DeepSeek rejects the union above outright — so the variants are
// flattened into one discriminated object. Per-variant constraints are still enforced: the runner
// re-checks every call against episodeTradeActionSchema, so this schema may never offer a variant
// that one rejects. The reverse is deliberate: `add` / `reduce` exist for the trainer only, and
// widening the model's tool surface would make new benchmark runs incomparable with the corpus.
export const episodeTradeActionToolSchema = Type.Object(
  {
    type: Type.Union([
      Type.Literal('hold'),
      Type.Literal('amend'),
      Type.Literal('cancel'),
      Type.Literal('exit_next_open'),
    ]),
    bars: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
    period: Type.Optional(advancePeriodSchema),
    stop: Type.Optional(Type.Number()),
    target: Type.Optional(Type.Number()),
    ...optionalReason,
  },
  { additionalProperties: false },
);

const episodeActionSchema = Type.Union([
  Type.Object({ type: Type.Literal('observe') }, { additionalProperties: false }),
  Type.Object(
    {
      type: Type.Literal('submit'),
      direction: Type.Union([Type.Literal('long'), Type.Literal('short'), Type.Literal('neutral')]),
      entry: Type.Optional(Type.Number()),
      stop: Type.Optional(Type.Number()),
      target: Type.Optional(Type.Number()),
      size: Type.Optional(positionSizeSchema),
      ...requiredReason,
    },
    { additionalProperties: false },
  ),
  episodeTradeActionSchema,
]);

export type EpisodeAction = Static<typeof episodeActionSchema>;

const episodeRecordedTradeActionSchema = Type.Union([
  Type.Object(
    {
      type: Type.Literal('hold'),
      bars: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
      period: Type.Optional(advancePeriodSchema),
      ...optionalReason,
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      type: Type.Literal('amend'),
      stop: Type.Optional(Type.Number()),
      target: Type.Optional(Type.Number()),
      ...optionalReason,
    },
    { additionalProperties: false },
  ),
  Type.Object({ type: Type.Literal('cancel'), ...optionalReason }, { additionalProperties: false }),
  Type.Object(
    { type: Type.Literal('exit_next_open'), ...optionalReason },
    { additionalProperties: false },
  ),
  Type.Object(
    { type: Type.Literal('add'), size: positionSizeSchema, ...optionalReason },
    { additionalProperties: false },
  ),
  Type.Object(
    { type: Type.Literal('reduce'), size: Type.Optional(positionSizeSchema), ...optionalReason },
    { additionalProperties: false },
  ),
]);

const episodeRecordedActionSchema = Type.Union([
  Type.Object({ type: Type.Literal('observe') }, { additionalProperties: false }),
  Type.Object(
    {
      type: Type.Literal('submit'),
      direction: Type.Union([Type.Literal('long'), Type.Literal('short'), Type.Literal('neutral')]),
      entry: Type.Optional(Type.Number()),
      stop: Type.Optional(Type.Number()),
      target: Type.Optional(Type.Number()),
      size: Type.Optional(positionSizeSchema),
      ...optionalReason,
    },
    { additionalProperties: false },
  ),
  episodeRecordedTradeActionSchema,
]);

const episodeTerminationReasonSchema = Type.Union([
  Type.Literal('abstain'),
  Type.Literal('no_decision'),
  Type.Literal('cancelled'),
  Type.Literal('no_fill'),
  Type.Literal('stop'),
  Type.Literal('target'),
  Type.Literal('manual'),
  Type.Literal('horizon'),
  Type.Literal('no_trade'),
]);

const executionPointSchema = Type.Object(
  { time: Type.String(), price: Type.Number() },
  { additionalProperties: false },
);

const episodeActionRecordSchema = Type.Object(
  {
    step: Type.Integer({ minimum: 1 }),
    tradeId: Type.Optional(Type.Union([Type.Integer({ minimum: 1 }), Type.Null()])),
    at: Type.String(),
    effectiveBarTime: Type.Union([Type.String(), Type.Null()]),
    action: episodeRecordedActionSchema,
  },
  { additionalProperties: false },
);

export type EpisodeActionRecord = Static<typeof episodeActionRecordSchema>;

const episodeExitReasonSchema = Type.Union([
  Type.Literal('stop'),
  Type.Literal('target'),
  Type.Literal('manual'),
  Type.Literal('horizon'),
]);

const episodeTradeLotSchema = Type.Object(
  { time: Type.String(), price: Type.Number(), size: positionSizeSchema },
  { additionalProperties: false },
);

export type EpisodeTradeLot = Static<typeof episodeTradeLotSchema>;

const episodeTradeExitSchema = Type.Object(
  {
    time: Type.String(),
    price: Type.Number(),
    size: positionSizeSchema,
    reason: episodeExitReasonSchema,
  },
  { additionalProperties: false },
);

export type EpisodeTradeExit = Static<typeof episodeTradeExitSchema>;

// `lots` / `exits` are optional so that answers written before position sizing existed still pass
// Value.Check on read — results.ts silently drops an answer the schema rejects, which would erase
// the historical corpus rather than fail loudly. The engine always writes both.
export const episodeClosedTradeSchema = Type.Object(
  {
    tradeId: Type.Integer({ minimum: 1 }),
    direction: Type.Union([Type.Literal('long'), Type.Literal('short')]),
    decisionBar: Type.Integer({ minimum: 0 }),
    decisionTime: Type.String(),
    entry: executionPointSchema,
    exit: executionPointSchema,
    lots: Type.Optional(Type.Array(episodeTradeLotSchema)),
    exits: Type.Optional(Type.Array(episodeTradeExitSchema)),
    exitReason: episodeExitReasonSchema,
    initialStop: Type.Number(),
    finalStop: Type.Number(),
    target: Type.Number(),
    initialRisk: Type.Number({ exclusiveMinimum: 0 }),
    grossR: Type.Number(),
    frictionR: Type.Number({ minimum: 0 }),
    netR: Type.Number(),
    mfeR: Type.Number({ minimum: 0 }),
    maeR: Type.Number({ minimum: 0 }),
    holdingBars: Type.Integer({ minimum: 0 }),
    entryReason: Type.Optional(episodeTradeReasonSchema),
  },
  { additionalProperties: false },
);

export type EpisodeClosedTrade = Static<typeof episodeClosedTradeSchema>;

const episodeTradeResultSchema = Type.Object(
  {
    terminationReason: episodeTerminationReasonSchema,
    direction: Type.Union([Type.Literal('long'), Type.Literal('short'), Type.Literal('neutral')]),
    entry: Type.Union([executionPointSchema, Type.Null()]),
    exit: Type.Union([executionPointSchema, Type.Null()]),
    initialRisk: nullableNumber,
    grossR: nullableNumber,
    frictionR: nullableNumber,
    netR: nullableNumber,
    mfeR: nullableNumber,
    maeR: nullableNumber,
    holdingBars: Type.Integer({ minimum: 0 }),
    steps: Type.Integer({ minimum: 0 }),
    decisionBar: Type.Optional(Type.Union([Type.Integer({ minimum: 0 }), Type.Null()])),
    decisionTime: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    observationBars: Type.Optional(Type.Integer({ minimum: 0 })),
    trades: Type.Optional(Type.Array(episodeClosedTradeSchema)),
    tradeCount: Type.Optional(Type.Integer({ minimum: 0 })),
    winCount: Type.Optional(Type.Integer({ minimum: 0 })),
    lossCount: Type.Optional(Type.Integer({ minimum: 0 })),
    maxDrawdownR: Type.Optional(Type.Number({ minimum: 0 })),
    actions: Type.Array(episodeActionRecordSchema),
  },
  { additionalProperties: false },
);

export type EpisodeTradeResult = Static<typeof episodeTradeResultSchema>;

const metricsSchema = Type.Object(
  {
    durationMs: Type.Number({ minimum: 0 }),
    costUsd: Type.Number({ minimum: 0 }),
    toolCalls: Type.Integer({ minimum: 0 }),
    inputTokens: Type.Integer({ minimum: 0 }),
    outputTokens: Type.Integer({ minimum: 0 }),
    guardrailHits: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);

export const episodeAnswerSchema = Type.Object(
  {
    questionId: Type.String(),
    symbol: Type.String(),
    layer: Type.String(),
    model: Type.String(),
    mode: Type.Union([Type.Literal('blind'), Type.Literal('live')]),
    rep: Type.Integer({ minimum: 0 }),
    status: Type.Union([
      Type.Literal('completed'),
      Type.Literal('format_violation'),
      Type.Literal('timeout'),
      Type.Literal('api_error'),
      Type.Literal('protocol_violation'),
    ]),
    initialSubmission: Type.Union([submissionSchema, Type.Null()]),
    result: Type.Union([episodeTradeResultSchema, Type.Null()]),
    metrics: metricsSchema,
    traceRef: Type.String(),
  },
  { additionalProperties: false },
);

export type EpisodeAnswer = Static<typeof episodeAnswerSchema>;
