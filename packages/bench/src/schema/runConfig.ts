import { type Static, Type } from "typebox";

const DEFAULT_JUDGMENT_WEIGHT = 0.8;
const DEFAULT_EFFICIENCY_WEIGHT = 0.2;
const DEFAULT_TIMEOUT_MS = 600_000;

export const weightsSchema = Type.Object(
  {
    judgment: Type.Number({ default: DEFAULT_JUDGMENT_WEIGHT }),
    efficiency: Type.Number({ default: DEFAULT_EFFICIENCY_WEIGHT }),
  },
  { additionalProperties: false },
);

export const runConfigSchema = Type.Object(
  {
    models: Type.Array(Type.String()),
    bank: Type.Union([Type.Literal("swing"), Type.Literal("intraday")]),
    modes: Type.Array(Type.Union([Type.Literal("blind"), Type.Literal("live")])),
    repeat: Type.Integer({ minimum: 1 }),
    datasetVersion: Type.String(),
    temperatures: Type.Record(Type.String(), Type.Union([Type.Number(), Type.Literal("default")])),
    weights: weightsSchema,
    timeoutMs: Type.Integer({ minimum: 1, default: DEFAULT_TIMEOUT_MS }),
  },
  { additionalProperties: false },
);

export type RunConfig = Static<typeof runConfigSchema>;

export const RUN_CONFIG_DEFAULTS = {
  weights: { judgment: DEFAULT_JUDGMENT_WEIGHT, efficiency: DEFAULT_EFFICIENCY_WEIGHT },
  timeoutMs: DEFAULT_TIMEOUT_MS,
} as const;
