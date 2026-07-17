import { type Static, Type } from "typebox";

const rankingEntrySchema = Type.Object(
  {
    model: Type.String(),
    total: Type.Number(),
    judgment: Type.Number(),
    efficiency: Type.Union([Type.Number(), Type.Null()]),
    abstainRate: Type.Number(),
    avgWinnerR: Type.Union([Type.Number(), Type.Null()]),
  },
  { additionalProperties: false },
);

export const reportSummarySchema = Type.Object(
  {
    runId: Type.String(),
    generatedAt: Type.String(),
    ranking: Type.Array(rankingEntrySchema),
    baselineComparison: Type.Object(
      { modelsBeatingBuyHold: Type.Array(Type.String()) },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export type ReportSummary = Static<typeof reportSummarySchema>;
