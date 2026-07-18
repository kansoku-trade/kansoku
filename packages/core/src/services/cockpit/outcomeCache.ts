import { inArray } from "drizzle-orm";
import type { AnalysisOutcome, OutcomeStatus } from "@kansoku/shared/types";
import { getDb, type Db } from "../../db/index.js";
import { outcomes } from "../../db/schema.js";

export interface OutcomeKey {
  chartId: string;
  symbol: string;
  direction: "long" | "short" | "neutral";
}

export async function getResolvedOutcomes(chartIds: string[], db: Db = getDb()): Promise<Map<string, AnalysisOutcome>> {
  if (!chartIds.length) return new Map();
  const rows = await db.select().from(outcomes).where(inArray(outcomes.chartId, chartIds));
  return new Map(
    rows.map((row) => [
      row.chartId,
      {
        status: row.status as OutcomeStatus,
        pct_since_anchor: row.pctSinceAnchor,
        resolved_at: row.resolvedAt,
      } satisfies AnalysisOutcome,
    ]),
  );
}

export async function saveResolvedOutcome(key: OutcomeKey, outcome: AnalysisOutcome, db: Db = getDb()): Promise<void> {
  if (outcome.status === "open" || outcome.resolved_at == null) return;
  await db
    .insert(outcomes)
    .values({
      chartId: key.chartId,
      symbol: key.symbol,
      direction: key.direction,
      status: outcome.status,
      pctSinceAnchor: outcome.pct_since_anchor,
      resolvedAt: outcome.resolved_at,
      judgedAt: new Date().toISOString(),
    })
    .onConflictDoNothing();
}
