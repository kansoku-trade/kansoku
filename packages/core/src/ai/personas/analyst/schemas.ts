import { type Static, Type } from 'typebox';

export const journalSchema = Type.Object({ content: Type.String() });

export const anchorSchema = Type.Object({
  timeframe: Type.Union([
    Type.Literal('m5'),
    Type.Literal('m15'),
    Type.Literal('h1'),
    Type.Literal('day'),
  ]),
  time: Type.String(),
  price: Type.Number(),
});

export const entryPlanSchema = Type.Object({
  entry: Type.Number(),
  stop: Type.Number(),
  target1: Type.Optional(Type.Number()),
  target2: Type.Optional(Type.Number()),
  target1_pct: Type.Optional(Type.Number()),
  target2_pct: Type.Optional(Type.Number()),
  note: Type.Optional(Type.String()),
  rationale: Type.Optional(Type.String()),
});

export const scenarioSchema = Type.Object({
  label: Type.String(),
  probability: Type.Number({
    minimum: 0,
    maximum: 100,
    description: 'A percentage from 0 to 100; the three scenario probabilities should sum to approximately 100.',
  }),
  trigger: Type.Optional(Type.String()),
  path: Type.Optional(Type.String()),
});

export const rangePlanSchema = Type.Object({
  condition: Type.Optional(Type.String()),
  long_tactic: Type.Optional(Type.String()),
  short_tactic: Type.Optional(Type.String()),
  low: Type.Optional(Type.Number({ description: 'Lower bound of the range; required for neutral.' })),
  high: Type.Optional(Type.Number({ description: 'Upper bound of the range; required for neutral.' })),
});

const lensScoreSchema = Type.Integer({ minimum: -5, maximum: 5 });

export const lensScoresSchema = Type.Object(
  {
    m5: lensScoreSchema,
    m15: lensScoreSchema,
    h1: lensScoreSchema,
    day: lensScoreSchema,
  },
  {
    description:
      'Per-timeframe directional score: −5 strongly bearish … +5 strongly bullish, 0 = no signal on that timeframe. A long/short call must resonate with these scores (aligned sum ≥ 4, at most one opposing lens) or it is rejected — submit neutral instead.',
  },
);

export const predictionSchema = Type.Object({
  direction: Type.Union([Type.Literal('long'), Type.Literal('short'), Type.Literal('neutral')]),
  anchor: anchorSchema,
  entry_plan: Type.Optional(entryPlanSchema),
  scenarios: Type.Array(scenarioSchema, { minItems: 2, maxItems: 4 }),
  lens_scores: lensScoresSchema,
  invalidation: Type.Array(
    Type.String({ description: 'One concrete condition that would falsify this thesis.' }),
    {
      minItems: 1,
      maxItems: 4,
      description:
        'Conditions that would falsify this thesis: a price break, a structure loss, or an event outcome. When a condition maps to a concrete price level, quote that price so it lines up with the stop or range bound drawn on the chart.',
    },
  ),
  range_plan: Type.Optional(rangePlanSchema),
  hypothesis_id: Type.Optional(
    Type.String({
      description:
        "Optional. When this call tests one of the registered hypotheses listed in data_snapshot.hypotheses, reference its id here; the settlement will then be booked against that thesis. Omit when none applies — never invent an id.",
    }),
  ),
  comment: Type.String({ description: 'A one-sentence plain-language conclusion to store as a comment.' }),
});

export type PredictionParams = Static<typeof predictionSchema>;

export const commentSchema = Type.Object({
  level: Type.Union([Type.Literal('info'), Type.Literal('warn'), Type.Literal('alert')]),
  text: Type.String({ description: 'A plain-language observation.' }),
});
