import { inArray } from 'drizzle-orm';
import type {
  AnalysisOutcome,
  ChartDoc,
  Hypothesis,
  HypothesisRunCard,
  IntradayPrediction,
  OutcomeStatus,
} from '@kansoku/shared/types';
import { getDb, type Db } from '../db/index.js';
import { outcomes } from '../db/schema.js';
import { loadChart as defaultLoadChart } from '../charts/store.js';
import { appendRunCard as defaultAppendRunCard } from '../journal/hypotheses.js';

export interface OutcomeKey {
  chartId: string;
  symbol: string;
  direction: 'long' | 'short' | 'neutral';
}

export async function getResolvedOutcomes(
  chartIds: string[],
  db: Db = getDb(),
): Promise<Map<string, AnalysisOutcome>> {
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

export interface OutcomeSettleHooks {
  loadChart?: (id: string) => Promise<ChartDoc | null>;
  appendRunCard?: (
    id: string,
    card: Omit<HypothesisRunCard, 'at'> & { at?: string },
  ) => Promise<Hypothesis>;
}

function hypothesisIdOf(doc: ChartDoc): string | undefined {
  const built = doc.built as { kind?: string; sidebar?: { prediction?: IntradayPrediction | null } };
  const prediction =
    (built?.kind === 'intraday' ? built.sidebar?.prediction : null) ??
    (doc.input?.prediction as IntradayPrediction | null | undefined);
  return prediction?.hypothesis_id;
}

async function settleHypothesisRunCard(
  key: OutcomeKey,
  outcome: AnalysisOutcome,
  hooks: OutcomeSettleHooks,
): Promise<void> {
  try {
    const doc = await (hooks.loadChart ?? defaultLoadChart)(key.chartId);
    const hypothesisId = doc && hypothesisIdOf(doc);
    if (!hypothesisId) return;
    await (hooks.appendRunCard ?? defaultAppendRunCard)(hypothesisId, {
      kind: 'prediction',
      ref: key.chartId,
      summary: `${key.symbol} ${key.direction} 预测结算 ${outcome.status}（自锚点 ${outcome.pct_since_anchor.toFixed(2)}%）`,
      outcome: outcome.status === 'hit_target' || outcome.status === 'held_range' ? 'support' : 'against',
    });
  } catch {
    return;
  }
}

export async function saveResolvedOutcome(
  key: OutcomeKey,
  outcome: AnalysisOutcome,
  db: Db = getDb(),
  hooks: OutcomeSettleHooks = {},
): Promise<void> {
  if (outcome.status === 'open' || outcome.resolved_at == null) return;
  const inserted = await db
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
    .onConflictDoNothing()
    .returning({ chartId: outcomes.chartId });
  if (inserted.length > 0) await settleHypothesisRunCard(key, outcome, hooks);
}
