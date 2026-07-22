import { describe, expect, it } from 'vitest';
import type { ChartDoc, CockpitComment, LensScores } from '@kansoku/shared/types';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { AiAgentFactory } from '../src/ai/agents/agentSession.js';
import type { AiModel } from '../src/ai/runtime/models.js';
import { aggregateSignals, runAggregator } from '../src/ai/personas/aggregator.js';

const fakeModel = { provider: 'anthropic', id: 'claude-haiku-4-5' } as unknown as AiModel;

type Tools = AgentTool[];

function chartDoc(input: {
  lens?: LensScores;
  direction?: 'long' | 'short' | 'neutral';
  dailyTrend?: 'up' | 'down' | 'range' | null;
  prediction?: boolean;
}): ChartDoc {
  const prediction =
    input.prediction === false
      ? null
      : {
          direction: input.direction ?? 'long',
          lens_scores: input.lens ?? { m5: 2, m15: 3, h1: 2, day: 1 },
        };
  return {
    id: 'chart-1',
    type: 'intraday',
    symbol: 'MU.US',
    built: {
      kind: 'intraday',
      sidebar: {
        prediction,
        dayContext: { daily_trend: input.dailyTrend ?? 'up' },
      },
    },
  } as unknown as ChartDoc;
}

function tool(tools: Tools, name: string) {
  const found = tools.find((t) => t.name === name);
  if (!found) throw new Error(`missing tool ${name}`);
  return found;
}

function harness(
  script: (tools: Tools) => Promise<void>,
  doc: ChartDoc | null,
  comments: CockpitComment[] = [],
) {
  const appended: CockpitComment[] = [];
  const agentFactory: AiAgentFactory = ({ tools }) => ({
    prompt: async () => {
      await script(tools);
    },
    abort: () => {},
  });
  const deps = {
    model: fakeModel,
    agentFactory,
    appendComment: async (c: CockpitComment) => {
      appended.push(c);
    },
    loadChart: async () => doc,
    listComments: async () => comments,
    disciplineText: '# trading-discipline\n假纪律全文。',
    now: () => new Date('2026-07-22T15:00:00.000Z'),
  };
  return { deps, appended };
}

describe('aggregateSignals', () => {
  it('weights day and h1 double in a trending market', () => {
    const result = aggregateSignals({
      lensScores: { m5: 0, m15: 0, h1: 4, day: 4 },
      marketState: 'trend',
    });
    expect(result.weightedSum).toBe(16);
    expect(result.resonance).toBe(Math.round((16 / 30) * 100));
    expect(result.lean).toBe('long');
  });

  it('weights m5 and m15 double in a ranging market', () => {
    const result = aggregateSignals({
      lensScores: { m5: -4, m15: -4, h1: 0, day: 0 },
      marketState: 'range',
    });
    expect(result.weightedSum).toBe(-16);
    expect(result.lean).toBe('short');
  });

  it('leans neutral when resonance is below the floor', () => {
    const result = aggregateSignals({
      lensScores: { m5: 1, m15: -1, h1: 1, day: 0 },
      marketState: 'unknown',
    });
    expect(result.lean).toBe('neutral');
  });
});

describe('runAggregator', () => {
  it('persists an aggregator feed row with verdict, mechanical resonance, and provenance', async () => {
    const { deps, appended } = harness(async (tools) => {
      await tool(tools, 'submit_verdict').execute('c1', {
        verdict: 'long',
        summary: '多周期与点评一致看多，维持原判。',
      });
    }, chartDoc({ direction: 'long', lens: { m5: 2, m15: 2, h1: 3, day: 3 }, dailyTrend: 'up' }));

    const result = await runAggregator({ symbol: 'MU.US', chartId: 'chart-1', deps });

    expect(result.submitted).toBe(true);
    expect(appended).toHaveLength(1);
    const row = appended[0];
    expect(row.source).toBe('aggregator');
    expect(row.verdict).toBe('long');
    expect(row.level).toBe('info');
    expect(row.chartId).toBe('chart-1');
    expect(typeof row.resonance).toBe('number');
    expect(row.resonance).toBe(aggregateSignals({
      lensScores: { m5: 2, m15: 2, h1: 3, day: 3 },
      marketState: 'trend',
    }).resonance);
    expect(row.provenance?.model).toBe('claude-haiku-4-5');
  });

  it('marks a verdict that contradicts the prediction as warn', async () => {
    const { deps, appended } = harness(async (tools) => {
      await tool(tools, 'submit_verdict').execute('c1', {
        verdict: 'neutral',
        summary: '点评连续两次与预测矛盾，建议降级为观望。',
      });
    }, chartDoc({ direction: 'long' }));

    await runAggregator({ symbol: 'MU.US', chartId: 'chart-1', deps });

    expect(appended[0].verdict).toBe('neutral');
    expect(appended[0].level).toBe('warn');
  });

  it('skips silently when the chart has no prediction', async () => {
    const { deps, appended } = harness(async () => {
      throw new Error('agent should not run');
    }, chartDoc({ prediction: false }));

    const result = await runAggregator({ symbol: 'MU.US', chartId: 'chart-1', deps });

    expect(result.submitted).toBe(false);
    expect(appended).toHaveLength(0);
  });

  it('rejects an empty summary and accepts the corrected resubmission', async () => {
    const { deps, appended } = harness(async (tools) => {
      const first = await tool(tools, 'submit_verdict').execute('c1', {
        verdict: 'long',
        summary: '   ',
      });
      expect((first.content[0] as { text: string }).text).toContain('rejected');
      await tool(tools, 'submit_verdict').execute('c2', {
        verdict: 'long',
        summary: '共振充分，维持看多。',
      });
    }, chartDoc({ direction: 'long' }));

    const result = await runAggregator({ symbol: 'MU.US', chartId: 'chart-1', deps });

    expect(result.submitted).toBe(true);
    expect(appended).toHaveLength(1);
  });
});
