import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Check } from 'typebox/value';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { describe, expect, it } from 'vitest';
import type { AiAgentFactory, AiAgentHandle } from '../src/ai/agents/agentSession.js';
import type { ReassessPack } from '../src/ai/agents/datapack.js';
import { runAnalyst } from '../src/ai/personas/analyst/run.js';
import { analystRunStatus } from '../src/ai/personas/analyst/runState.js';
import { buildSubmitSectionTool } from '../src/ai/personas/analyst/tools.js';
import {
  submitSectionSchema,
  validateSubmitSection,
  type SubmitSectionParams,
} from '../src/ai/personas/analyst/schemas.js';
import type { AiModel } from '../src/ai/runtime/models.js';

const fakeModel = { provider: 'anthropic', id: 'claude-haiku-4-5' } as unknown as AiModel;
const FAKE_SKILL = '# intraday-signal\n假技能全文。';
const FAKE_DISCIPLINE = '# trading-discipline\n假纪律全文。';

const validPrediction = {
  direction: 'long' as const,
  anchor: { timeframe: 'm5' as const, time: '2026-07-05T15:00:00Z', price: 100 },
  entry_plan: { entry: 100, stop: 97, target1: 104, target2: 108 },
  scenarios: [
    { label: '上破', probability: 50 },
    { label: '震荡', probability: 30 },
    { label: '下破', probability: 20 },
  ],
  comment: '多头结构完好，站上 100 看 104。',
};

const validTechnical: SubmitSectionParams = {
  kind: 'technical',
  trends: [
    { timeframe: 'm5', trend: 'up' },
    { timeframe: 'h1', trend: 'sideways' },
  ],
  levels: [{ price: 100, label: '前高' }],
  summary: '短周期偏多，1 小时震荡。',
};

const validContext: SubmitSectionParams = {
  kind: 'context',
  summary: '消息面平静，资金流入放缓。',
  bias: 'neutral',
};

function makePack(): ReassessPack {
  return {
    symbol: 'MU.US',
    as_of: '2026-07-05T15:00:00.000Z',
    timeframes: {} as ReassessPack['timeframes'],
    flow: [],
    rel_volume: null,
    day_levels: null,
    day_context: null,
    options_levels: null,
    event_risk: null,
    lessons: [],
    market: { spy: null, qqq: null },
    news: [],
    prediction: null,
    prediction_chart_id: null,
    position: null,
  };
}

function findTool(tools: AgentTool[], name: string): AgentTool {
  const found = tools.find((t) => t.name === name);
  if (!found) throw new Error(`missing tool ${name}`);
  return found;
}

function resultText(res: { content: Array<{ type: string; text?: string }> }): string {
  const first = res.content[0];
  return first.type === 'text' ? (first.text ?? '') : '';
}

describe('submit_section schema', () => {
  it('accepts a valid technical payload', () => {
    expect(Check(submitSectionSchema, validTechnical)).toBe(true);
    expect(validateSubmitSection(validTechnical)).toEqual([]);
  });

  it('accepts a valid context payload', () => {
    expect(Check(submitSectionSchema, validContext)).toBe(true);
    expect(validateSubmitSection(validContext)).toEqual([]);
  });

  it('rejects a duplicate timeframe among trends', () => {
    const payload: SubmitSectionParams = {
      ...validTechnical,
      trends: [
        { timeframe: 'm5', trend: 'up' },
        { timeframe: 'm5', trend: 'down' },
      ],
    };
    expect(Check(submitSectionSchema, payload)).toBe(true);
    expect(validateSubmitSection(payload)).not.toEqual([]);
  });

  it('rejects 0 levels', () => {
    expect(Check(submitSectionSchema, { ...validTechnical, levels: [] })).toBe(false);
  });

  it('rejects 9 levels', () => {
    const levels = Array.from({ length: 9 }, (_, i) => ({ price: 100 + i, label: `位 ${i}` }));
    expect(Check(submitSectionSchema, { ...validTechnical, levels })).toBe(false);
  });

  it('rejects a non-positive price', () => {
    expect(
      Check(submitSectionSchema, { ...validTechnical, levels: [{ price: 0, label: 'x' }] }),
    ).toBe(false);
    expect(
      Check(submitSectionSchema, { ...validTechnical, levels: [{ price: -5, label: 'x' }] }),
    ).toBe(false);
  });

  it('rejects a NaN price', () => {
    expect(
      Check(submitSectionSchema, { ...validTechnical, levels: [{ price: NaN, label: 'x' }] }),
    ).toBe(false);
  });

  it('rejects an empty label', () => {
    expect(
      Check(submitSectionSchema, { ...validTechnical, levels: [{ price: 100, label: '' }] }),
    ).toBe(false);
  });

  it('rejects a label over 30 characters', () => {
    expect(
      Check(submitSectionSchema, {
        ...validTechnical,
        levels: [{ price: 100, label: 'x'.repeat(31) }],
      }),
    ).toBe(false);
  });

  it('rejects an empty summary', () => {
    expect(Check(submitSectionSchema, { ...validTechnical, summary: '' })).toBe(false);
    expect(Check(submitSectionSchema, { ...validContext, summary: '' })).toBe(false);
  });

  it('rejects a summary over 200 characters', () => {
    expect(Check(submitSectionSchema, { ...validTechnical, summary: 'x'.repeat(201) })).toBe(false);
    expect(Check(submitSectionSchema, { ...validContext, summary: 'x'.repeat(201) })).toBe(false);
  });

  it('rejects a bad bias', () => {
    expect(Check(submitSectionSchema, { ...validContext, bias: 'sideways' })).toBe(false);
  });

  it('rejects an unknown kind', () => {
    expect(Check(submitSectionSchema, { ...validTechnical, kind: 'fundamental' })).toBe(false);
  });

  it('rejects 0 trends and more than 4 trends', () => {
    expect(Check(submitSectionSchema, { ...validTechnical, trends: [] })).toBe(false);
    const trends = (['m5', 'm15', 'h1', 'day'] as const).map((timeframe) => ({
      timeframe,
      trend: 'up' as const,
    }));
    expect(
      Check(submitSectionSchema, { ...validTechnical, trends: [...trends, trends[0]] }),
    ).toBe(false);
  });

  it('rejects a technical payload that also carries bias', () => {
    const payload = { ...validTechnical, bias: 'bullish' as const };
    expect(Check(submitSectionSchema, payload)).toBe(true);
    expect(validateSubmitSection(payload)).not.toEqual([]);
  });

  it('rejects a context payload that also carries trends or levels', () => {
    const withTrends = { ...validContext, trends: validTechnical.trends };
    expect(Check(submitSectionSchema, withTrends)).toBe(true);
    expect(validateSubmitSection(withTrends)).not.toEqual([]);

    const withLevels = { ...validContext, levels: validTechnical.levels };
    expect(Check(submitSectionSchema, withLevels)).toBe(true);
    expect(validateSubmitSection(withLevels)).not.toEqual([]);
  });

  it('rejects a technical payload missing trends or levels', () => {
    const { trends: _trends, ...missingTrends } = validTechnical;
    expect(Check(submitSectionSchema, missingTrends)).toBe(true);
    expect(validateSubmitSection(missingTrends as SubmitSectionParams)).not.toEqual([]);

    const { levels: _levels, ...missingLevels } = validTechnical;
    expect(Check(submitSectionSchema, missingLevels)).toBe(true);
    expect(validateSubmitSection(missingLevels as SubmitSectionParams)).not.toEqual([]);
  });

  it('rejects a context payload missing bias', () => {
    const { bias: _bias, ...missingBias } = validContext;
    expect(Check(submitSectionSchema, missingBias)).toBe(true);
    expect(validateSubmitSection(missingBias as SubmitSectionParams)).not.toEqual([]);
  });

  it('registers submit_section with a non-empty top-level input schema', () => {
    const tool = buildSubmitSectionTool('REGRESSION.US', { now: () => Date.now() });
    const schema = tool.parameters as { properties?: Record<string, unknown>; required?: string[] };
    expect(schema.properties).toBeTruthy();
    expect(Object.keys(schema.properties ?? {})).toEqual(expect.arrayContaining(['kind', 'summary']));
    expect(schema.required).toBeTruthy();
    expect(schema.required?.length).toBeGreaterThan(0);
    expect(schema.required).toEqual(expect.arrayContaining(['kind', 'summary']));
  });
});

describe('submit_section tool handler', () => {
  function startHangingRun(symbol: string): { release: () => void; done: Promise<void> } {
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sandbox = mkdtempSync(join(tmpdir(), 'analyst-sections-test-'));
    const agentFactory: AiAgentFactory = () => {
      const agent: AiAgentHandle = {
        prompt: () => wait,
        abort: () => {},
      };
      return agent;
    };
    const run = runAnalyst({
      symbol,
      origin: 'manual',
      deps: {
        model: fakeModel,
        agentFactory,
        buildReassessPack: async () => makePack(),
        appendComment: async () => {},
        repoRoot: sandbox,
        journalDir: join(sandbox, 'journal'),
        skillText: FAKE_SKILL,
        disciplineText: FAKE_DISCIPLINE,
      },
    });
    if (!run.started) throw new Error('expected run to start');
    return { release, done: run.done };
  }

  it('records a valid technical payload into the run status', async () => {
    const symbol = 'SECTION-TOOL-TECHNICAL.US';
    const { release, done } = startHangingRun(symbol);
    const now = () => Date.parse('2026-07-23T00:00:00.000Z');
    const tool = buildSubmitSectionTool(symbol, { now });

    const res = await tool.execute('c1', validTechnical);
    expect(resultText(res)).toContain('recorded');
    expect(res.terminate).not.toBe(true);

    const status = analystRunStatus(symbol);
    if (!status.running) throw new Error('expected running status');
    expect(status.sections?.technical?.summary).toBe(validTechnical.summary);

    release();
    await done;
  });

  it('records a valid context payload into the run status', async () => {
    const symbol = 'SECTION-TOOL-CONTEXT.US';
    const { release, done } = startHangingRun(symbol);
    const now = () => Date.parse('2026-07-23T00:00:00.000Z');
    const tool = buildSubmitSectionTool(symbol, { now });

    const res = await tool.execute('c1', validContext);
    expect(resultText(res)).toContain('recorded');

    const status = analystRunStatus(symbol);
    if (!status.running) throw new Error('expected running status');
    expect(status.sections?.context).toEqual({ summary: validContext.summary, bias: 'neutral' });

    release();
    await done;
  });

  it('rejects an invalid payload without throwing and leaves the run status unchanged', async () => {
    const symbol = 'SECTION-TOOL-INVALID.US';
    const { release, done } = startHangingRun(symbol);
    const now = () => Date.parse('2026-07-23T00:00:00.000Z');
    const tool = buildSubmitSectionTool(symbol, { now });

    let res: Awaited<ReturnType<typeof tool.execute>> | undefined;
    await expect(
      (async () => {
        res = await tool.execute('c1', { ...validTechnical, levels: [] });
      })(),
    ).resolves.toBeUndefined();

    expect(resultText(res!)).not.toContain('recorded');
    const status = analystRunStatus(symbol);
    if (!status.running) throw new Error('expected running status');
    expect(status.sections).toEqual({});

    release();
    await done;
  });

  it('rejects a structurally valid but business-invalid payload (duplicate timeframe) without throwing', async () => {
    const symbol = 'SECTION-TOOL-DUP.US';
    const { release, done } = startHangingRun(symbol);
    const now = () => Date.parse('2026-07-23T00:00:00.000Z');
    const tool = buildSubmitSectionTool(symbol, { now });

    const res = await tool.execute('c1', {
      ...validTechnical,
      trends: [
        { timeframe: 'm5', trend: 'up' },
        { timeframe: 'm5', trend: 'down' },
      ],
    });

    expect(resultText(res)).not.toContain('recorded');
    const status = analystRunStatus(symbol);
    if (!status.running) throw new Error('expected running status');
    expect(status.sections).toEqual({});

    release();
    await done;
  });
});

describe('analyst run with intermediate sections', () => {
  it('completes exactly as before when the agent submits technical, then context, then the prediction', async () => {
    const symbol = 'SECTIONS-FULL-RUN.US';
    const sandbox = mkdtempSync(join(tmpdir(), 'analyst-sections-run-test-'));
    let chartId: string | undefined;

    const agentFactory: AiAgentFactory = ({ tools }) => {
      const agent: AiAgentHandle = {
        prompt: async () => {
          await findTool(tools, 'submit_section').execute('c1', validTechnical);
          await findTool(tools, 'submit_section').execute('c2', validContext);
          const res = await findTool(tools, 'submit_prediction').execute('c3', validPrediction);
          chartId = JSON.parse(resultText(res)).chartId;
        },
        abort: () => {},
      };
      return agent;
    };

    const run = runAnalyst({
      symbol,
      origin: 'manual',
      deps: {
        model: fakeModel,
        agentFactory,
        buildReassessPack: async () => makePack(),
        appendComment: async () => {},
        createChart: async () => ({ id: 'chart-sections', url: 'http://localhost/#/charts/chart-sections' }),
        repoRoot: sandbox,
        journalDir: join(sandbox, 'journal'),
        skillText: FAKE_SKILL,
        disciplineText: FAKE_DISCIPLINE,
      },
    });
    if (!run.started) throw new Error('expected run to start');
    await run.done;

    expect(chartId).toBe('chart-sections');
    expect(analystRunStatus(symbol)).toEqual({ running: false });
  });
});
