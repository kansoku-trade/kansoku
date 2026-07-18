import { type Static, Type } from "typebox";
import { episodeTradeReasonSchema } from "./tradeReason.js";

const anchorSchema = Type.Object(
  {
    timeframe: Type.Union([Type.Literal("m5"), Type.Literal("m15"), Type.Literal("h1"), Type.Literal("day")]),
    time: Type.String(),
    price: Type.Number(),
  },
  { additionalProperties: false },
);

const entryPlanSchema = Type.Object(
  {
    entry: Type.Number(),
    stop: Type.Number(),
    target1: Type.Optional(Type.Number()),
    target2: Type.Optional(Type.Number()),
    target1_pct: Type.Optional(Type.Number()),
    target2_pct: Type.Optional(Type.Number()),
    note: Type.Optional(Type.String()),
    rationale: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

const scenarioSchema = Type.Object(
  {
    label: Type.String(),
    probability: Type.Number({ minimum: 0, maximum: 100 }),
    trigger: Type.Optional(Type.String()),
    path: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

const rangePlanSchema = Type.Object(
  {
    condition: Type.Optional(Type.String()),
    long_tactic: Type.Optional(Type.String()),
    short_tactic: Type.Optional(Type.String()),
    low: Type.Optional(Type.Number()),
    high: Type.Optional(Type.Number()),
  },
  { additionalProperties: false },
);

export const submissionSchema = Type.Object(
  {
    direction: Type.Union([Type.Literal("long"), Type.Literal("short"), Type.Literal("neutral")]),
    anchor: anchorSchema,
    entry_plan: Type.Optional(entryPlanSchema),
    scenarios: Type.Array(scenarioSchema, { minItems: 2, maxItems: 4 }),
    range_plan: Type.Optional(rangePlanSchema),
    decision_reason: Type.Optional(episodeTradeReasonSchema),
    comment: Type.String(),
  },
  { additionalProperties: false },
);

export type Submission = Static<typeof submissionSchema>;
