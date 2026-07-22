import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';
import type {
  ChartDoc,
  CockpitComment,
  IntradayPrediction,
  LensScores,
} from '@kansoku/shared/types';
import { PROJECT_ROOT } from '../../platform/env.js';
import { easternDate } from '../../marketdata/session.js';
import { loadChart as defaultLoadChart } from '../../charts/store.js';
import { createAgentSession, type AiAgentFactory } from '../agents/agentSession.js';
import { createRunLock } from '../agents/runLock.js';
import { aiConfig, type AiModel } from '../runtime/models.js';
import { AGGREGATOR_PROMPT, AGGREGATOR_RETRY_PROMPT } from '../runtime/prompts.js';
import { composeWithDiscipline, loadSharedDiscipline } from '../runtime/promptPolicy.js';
import { buildProvenance } from '../runtime/provenance.js';
import {
  appendComment as defaultAppendComment,
  listComments as defaultListComments,
} from './comments.js';

const DEFAULT_TIMEOUT_MS = 2 * 60_000;
const RESONANCE_FLOOR = 20;
const MAX_FEED_ROWS = 20;
const LENS_KEYS = ['m5', 'm15', 'h1', 'day'] as const;

export type MarketState = 'trend' | 'range' | 'unknown';

const WEIGHTS: Record<MarketState, LensScores> = {
  trend: { m5: 1, m15: 1, h1: 2, day: 2 },
  range: { m5: 2, m15: 2, h1: 1, day: 1 },
  unknown: { m5: 1, m15: 1, h1: 1, day: 1 },
};

export function aggregateSignals(input: { lensScores: LensScores; marketState: MarketState }): {
  lean: 'long' | 'short' | 'neutral';
  resonance: number;
  weightedSum: number;
} {
  const weights = WEIGHTS[input.marketState];
  let weightedSum = 0;
  let max = 0;
  for (const key of LENS_KEYS) {
    weightedSum += weights[key] * input.lensScores[key];
    max += weights[key] * 5;
  }
  const resonance = Math.round((Math.abs(weightedSum) / max) * 100);
  const lean = resonance < RESONANCE_FLOOR ? 'neutral' : weightedSum > 0 ? 'long' : 'short';
  return { lean, resonance, weightedSum };
}

const verdictSchema = Type.Object({
  verdict: Type.Union([Type.Literal('long'), Type.Literal('short'), Type.Literal('neutral')]),
  summary: Type.String({
    description: 'At most two plain-language sentences: the unified read and what it rests on.',
  }),
});

export interface AggregatorDeps {
  model: AiModel;
  agentFactory?: AiAgentFactory;
  appendComment?: (comment: CockpitComment) => Promise<void>;
  loadChart?: (id: string) => Promise<ChartDoc | null>;
  listComments?: (symbol: string, date: string) => Promise<CockpitComment[]>;
  disciplineText?: string;
  repoRoot?: string;
  timeoutMs?: number;
  now?: () => Date;
}

interface IntradaySidebarView {
  prediction?: IntradayPrediction | null;
  dayContext?: { daily_trend?: string | null } | null;
}

function sidebarOf(doc: ChartDoc): IntradaySidebarView | null {
  const built = doc.built as { kind?: string; sidebar?: IntradaySidebarView };
  return built?.kind === 'intraday' ? (built.sidebar ?? null) : null;
}

function marketStateOf(sidebar: IntradaySidebarView): MarketState {
  const trend = sidebar.dayContext?.daily_trend ?? null;
  if (trend === 'up' || trend === 'down') return 'trend';
  if (trend === 'range') return 'range';
  return 'unknown';
}

const aggregatorRunLock = createRunLock();

export async function runAggregator({
  symbol,
  chartId,
  deps,
}: {
  symbol: string;
  chartId: string | null;
  deps: AggregatorDeps;
}): Promise<{ submitted: boolean }> {
  if (!chartId) return { submitted: false };
  if (!aggregatorRunLock.tryAcquire(symbol)) return { submitted: false };
  try {
    const doc = await (deps.loadChart ?? defaultLoadChart)(chartId);
    const sidebar = doc ? sidebarOf(doc) : null;
    const prediction = sidebar?.prediction;
    if (!sidebar || !prediction?.lens_scores) return { submitted: false };

    const marketState = marketStateOf(sidebar);
    const mechanical = aggregateSignals({ lensScores: prediction.lens_scores, marketState });
    const now = deps.now ?? (() => new Date());
    const feed = (await (deps.listComments ?? defaultListComments)(symbol, easternDate(now())))
      .filter((row) => row.source !== 'aggregator' && row.level !== 'error')
      .slice(-MAX_FEED_ROWS);
    const disciplineText =
      deps.disciplineText ?? (loadSharedDiscipline(deps.repoRoot ?? PROJECT_ROOT) ?? '');
    if (!disciplineText) return { submitted: false };
    const systemPrompt = composeWithDiscipline(disciplineText, AGGREGATOR_PROMPT);
    const provenance = buildProvenance(deps.model, systemPrompt);
    const append = deps.appendComment ?? defaultAppendComment;

    let submitted = false;
    const sessionRef: { current: ReturnType<typeof createAgentSession> | null } = { current: null };
    const submitTool: AgentTool<typeof verdictSchema> = {
      name: 'submit_verdict',
      label: 'Submit Verdict',
      description: 'Submit the unified verdict. Call exactly once after weighing the evidence.',
      parameters: verdictSchema,
      execute: async (_id, params) => {
        if (sessionRef.current?.isDone()) {
          return { content: [{ type: 'text', text: 'skipped' }], details: {}, terminate: true };
        }
        const summary = params.summary.trim();
        if (!summary) {
          return { content: [{ type: 'text', text: 'rejected: summary is empty' }], details: {} };
        }
        await append({
          ts: now().toISOString(),
          symbol,
          level: params.verdict === prediction.direction ? 'info' : 'warn',
          text: summary,
          source: 'aggregator',
          chartId,
          verdict: params.verdict,
          resonance: mechanical.resonance,
          provenance,
        });
        submitted = true;
        return { content: [{ type: 'text', text: 'recorded' }], details: {}, terminate: true };
      },
    };

    const session = createAgentSession({
      layer: 'aggregator',
      symbol,
      model: deps.model,
      systemPrompt,
      tools: [submitTool],
      agentFactory: deps.agentFactory,
    });
    sessionRef.current = session;

    const payload = JSON.stringify({
      prediction: {
        direction: prediction.direction,
        lens_scores: prediction.lens_scores,
        invalidation: prediction.invalidation ?? [],
      },
      mechanical: {
        market_state: marketState,
        lean: mechanical.lean,
        resonance: mechanical.resonance,
        weighted_sum: mechanical.weightedSum,
      },
      feed: feed.map(({ ts, source, level, text, escalated }) => ({
        ts,
        source,
        level,
        text,
        ...(escalated ? { escalated } : {}),
      })),
    });
    const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    await session.runTurn(payload, timeoutMs);
    if (!submitted && !session.agent.state?.errorMessage) {
      await session.runTurn(AGGREGATOR_RETRY_PROMPT, timeoutMs);
    }
    return { submitted };
  } catch (err) {
    console.error(`aggregator: ${symbol} run failed`, err);
    return { submitted: false };
  } finally {
    aggregatorRunLock.release(symbol);
  }
}

export function maybeRunAggregator(input: { symbol: string; chartId: string | null }): void {
  let model: AiModel | null;
  try {
    model = aiConfig().commentModel;
  } catch {
    return;
  }
  if (!model) return;
  void runAggregator({ symbol: input.symbol, chartId: input.chartId, deps: { model } }).catch(
    () => {},
  );
}
