import type { AgentTool } from '@earendil-works/pi-agent-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChartDoc } from '@kansoku/shared/types';
import type { AiAgentFactory } from '../src/ai/agents/agentSession.js';
import type { AiModel } from '../src/ai/runtime/models.js';

const ctx = vi.hoisted(() => {
  const base = process.env.TMPDIR ?? '/tmp/';
  const sep = base.endsWith('/') ? '' : '/';
  return {
    dir: `${base}${sep}chat-suggest-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  };
});

vi.mock('../src/platform/env.js', () => ({ CHART_DATA_DIR: ctx.dir }));

const { buildChatSuggestions, clearChatSuggestionCache } =
  await import('../src/ai/chat/chatSuggestions.js');

type SuggestionDeps = Parameters<typeof buildChatSuggestions>[1];

const fakeModel = { provider: 'anthropic', id: 'claude-haiku-4-5' } as unknown as AiModel;

function fakeDoc(overrides: Partial<ChartDoc> = {}): ChartDoc {
  return {
    id: 'chart-1',
    schema_version: 2,
    type: 'intraday',
    title: 'MU 短线',
    symbol: 'MU.US',
    created_at: '2026-07-05T14:00:00.000Z',
    updated_at: '2026-07-05T14:00:00.000Z',
    input: {},
    built: { kind: 'intraday' } as unknown as ChartDoc['built'],
    ...overrides,
  };
}

function submitFactory(questions: unknown, onCall?: () => void): AiAgentFactory {
  return (config) => ({
    prompt: async () => {
      onCall?.();
      const tool = config.tools[0] as AgentTool;
      await tool.execute('call-1', { questions } as never);
    },
    abort: () => {},
    state: { messages: [] },
  });
}

function baseDeps(overrides: Partial<SuggestionDeps> = {}): SuggestionDeps {
  return {
    model: fakeModel,
    loadChart: async () => fakeDoc(),
    listComments: async () => [],
    ...overrides,
  };
}

describe('buildChatSuggestions', () => {
  beforeEach(() => {
    clearChatSuggestionCache();
  });

  it('returns the generated questions', async () => {
    const deps = baseDeps({
      agentFactory: submitFactory(['凭什么说偏空？', '失效位怎么来的', '和 SMH 比强弱']),
    });
    expect(await buildChatSuggestions('chart-1', deps)).toEqual([
      '凭什么说偏空？',
      '失效位怎么来的',
      '和 SMH 比强弱',
    ]);
  });

  it('drops blanks and duplicates, and caps at three', async () => {
    const deps = baseDeps({
      agentFactory: submitFactory(['  一  ', '一', '', '二', 42, '三', '四']),
    });
    expect(await buildChatSuggestions('chart-1', deps)).toEqual(['一', '二', '三']);
  });

  it('returns an empty list when no model is configured', async () => {
    const deps = baseDeps({
      model: null,
      agentFactory: submitFactory(['不该被调用']),
    });
    expect(await buildChatSuggestions('chart-1', deps)).toEqual([]);
  });

  it('returns an empty list when the chart is not an intraday chart', async () => {
    const deps = baseDeps({
      loadChart: async () => fakeDoc({ built: { kind: 'daily' } as unknown as ChartDoc['built'] }),
    });
    expect(await buildChatSuggestions('chart-1', deps)).toEqual([]);
  });

  it('swallows generation failures instead of throwing', async () => {
    const deps = baseDeps({
      agentFactory: () => ({
        prompt: async () => {
          throw new Error('model exploded');
        },
        abort: () => {},
        state: { messages: [] },
      }),
    });
    expect(await buildChatSuggestions('chart-1', deps)).toEqual([]);
  });

  it('caches per chart so the model runs once', async () => {
    let calls = 0;
    const deps = baseDeps({ agentFactory: submitFactory(['一', '二', '三'], () => calls++) });
    await buildChatSuggestions('chart-cached', deps);
    await buildChatSuggestions('chart-cached', deps);
    expect(calls).toBe(1);
  });

  it('does not cache an empty result', async () => {
    let calls = 0;
    const failing = baseDeps({
      agentFactory: () => ({
        prompt: async () => {
          calls++;
          throw new Error('model exploded');
        },
        abort: () => {},
        state: { messages: [] },
      }),
    });
    await buildChatSuggestions('chart-retry', failing);
    await buildChatSuggestions('chart-retry', failing);
    expect(calls).toBe(2);
  });
});
