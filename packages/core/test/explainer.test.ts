import { describe, expect, it } from 'vitest';
import type { CockpitComment, CommentStance } from '@kansoku/shared/types';
import type { AiAgentFactory, AiAgentHandle } from '../src/ai/agents/agentSession.js';
import { explainSymbol, type ExplainerDeps } from '../src/ai/personas/explainer.js';
import type { CommentPack } from '../src/ai/agents/datapack.js';
import type { AiModel } from '../src/ai/runtime/models.js';

const fakeModel = { provider: 'anthropic', id: 'claude-haiku-4-5' } as unknown as AiModel;

function makePack(symbol: string): CommentPack {
  return {
    symbol,
    as_of: '2026-07-05T15:00:00.000Z',
    quote: {} as CommentPack['quote'],
    m5: { bars: [], macd: { dif: [], dea: [], hist: [] } },
    flow: [],
    prediction: null,
    recent_comments: [],
    day_levels: { prev_day: null, pre_market: null, opening_range: null },
    rel_volume: null,
  };
}

interface Harness {
  deps: ExplainerDeps;
  comments: CockpitComment[];
}

function harness(
  build: (
    tools: Parameters<AiAgentFactory>[0]['tools'],
    submit: (text: string, stance: CommentStance) => Promise<void>,
  ) => AiAgentHandle,
  overrides: Partial<ExplainerDeps> = {},
): Harness {
  const comments: CockpitComment[] = [];
  const appendComment = async (c: CockpitComment) => {
    comments.push(c);
  };
  const agentFactory: AiAgentFactory = ({ tools }) => {
    const tool = tools.find((t) => t.name === 'submit_explanation');
    const submit = async (text: string, stance: CommentStance) => {
      await tool?.execute('call-1', { text, stance });
    };
    return build(tools, submit);
  };
  return {
    deps: {
      resolveModel: () => fakeModel,
      buildPack: async (symbol) => makePack(symbol),
      agentFactory,
      appendComment,
      ...overrides,
    },
    comments,
  };
}

describe('explainSymbol', () => {
  it('persists an explainer comment and returns it when the agent submits', async () => {
    const { deps, comments } = harness((_tools, submit) => ({
      prompt: async () => {
        await submit('图上有什么……一句话结论：按计划执行。', 'act_per_plan');
      },
      abort: () => {},
    }));

    const result = await explainSymbol('MU.US', deps);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(comments).toHaveLength(1);
    const c = comments[0];
    expect(result.comment).toBe(c);
    expect(c.symbol).toBe('MU.US');
    expect(c.source).toBe('explainer');
    expect(c.level).toBe('info');
    expect(c.text).toBe('图上有什么……一句话结论：按计划执行。');
    expect(c.stance).toBe('act_per_plan');
    expect(c.trigger).toBe('manual: 解读请求');
    expect('read' in c).toBe(false);
    expect('stanceNote' in c).toBe(false);
    expect('escalated' in c).toBe(false);
    expect(typeof c.ts).toBe('string');
  });

  it('recovers when the agent submits only after the retry nudge', async () => {
    const prompts: string[] = [];
    const { deps, comments } = harness((_tools, submit) => ({
      prompt: async (text: string) => {
        prompts.push(text);
        if (prompts.length === 2) await submit('迟到的解读', 'wait_confirm');
      },
      abort: () => {},
    }));

    const result = await explainSymbol('NVDA.US', deps);

    expect(result.ok).toBe(true);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain('submit_explanation');
    expect(comments).toHaveLength(1);
    expect(comments[0].source).toBe('explainer');
    expect(comments[0].stance).toBe('wait_confirm');
  });

  it('writes a system error comment and returns failed when the agent never submits', async () => {
    let promptCalls = 0;
    const { deps, comments } = harness(() => ({
      prompt: async () => {
        promptCalls += 1;
      },
      abort: () => {},
    }));

    const result = await explainSymbol('TSM.US', deps);

    expect(result).toEqual({ ok: false, reason: 'failed' });
    expect(promptCalls).toBe(2);
    expect(comments).toHaveLength(1);
    expect(comments[0].level).toBe('error');
    expect(comments[0].source).toBe('system');
    expect(comments[0].trigger).toBe('manual: 解读请求');
  });

  it('returns disabled without running when no comment model is configured', async () => {
    let factoryCalls = 0;
    const { deps, comments } = harness(
      () => {
        factoryCalls += 1;
        return { prompt: async () => {}, abort: () => {} };
      },
      { resolveModel: () => null },
    );

    const result = await explainSymbol('AAPL.US', deps);

    expect(result).toEqual({ ok: false, reason: 'disabled' });
    expect(factoryCalls).toBe(0);
    expect(comments).toHaveLength(0);
  });

  it('rejects a second concurrent call for the same symbol as busy without a second run', async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let factoryCalls = 0;
    const { deps, comments } = harness((_tools, submit) => {
      factoryCalls += 1;
      return {
        prompt: async () => {
          await gate;
          await submit('并发解读', 'no_action');
        },
        abort: () => {},
      };
    });

    const first = explainSymbol('AMD.US', deps);
    const second = await explainSymbol('AMD.US', deps);

    expect(second).toEqual({ ok: false, reason: 'busy' });
    expect(factoryCalls).toBe(1);
    expect(comments).toHaveLength(0);

    release!();
    const firstResult = await first;
    expect(firstResult.ok).toBe(true);
    expect(comments).toHaveLength(1);
  });

  it('allows a fresh run for the same symbol after the previous one finished', async () => {
    let factoryCalls = 0;
    const { deps } = harness((_tools, submit) => {
      factoryCalls += 1;
      return {
        prompt: async () => {
          await submit('第一次', 'no_action');
        },
        abort: () => {},
      };
    });

    await explainSymbol('SMCI.US', deps);
    await explainSymbol('SMCI.US', deps);

    expect(factoryCalls).toBe(2);
  });

  it('aborts and writes an error comment when the agent hangs past the timeout', async () => {
    let aborted = false;
    const { deps, comments } = harness(
      () => ({
        prompt: () => new Promise<void>(() => {}),
        abort: () => {
          aborted = true;
        },
      }),
      { timeoutMs: 10 },
    );

    const result = await explainSymbol('SNOW.US', deps);

    expect(result).toEqual({ ok: false, reason: 'failed' });
    expect(aborted).toBe(true);
    expect(comments).toHaveLength(1);
    expect(comments[0].level).toBe('error');
    expect(comments[0].source).toBe('system');
    expect(comments[0].text).toContain('超时');
  });
});
