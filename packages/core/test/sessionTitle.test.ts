import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { describe, expect, it } from 'vitest';
import type { AiAgentFactory } from '../src/ai/agents/agentSession.js';
import {
  DEFAULT_ASSISTANT_TITLE,
  generateSessionTitle,
  sanitizeGeneratedTitle,
  shouldAssignGeneratedTitle,
} from '../src/ai/assistant/sessionTitle.js';
import type { AiModel } from '../src/ai/runtime/models.js';

const model = { provider: 'anthropic', id: 'title-model' } as unknown as AiModel;
const ZERO_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function assistant(text: string): AgentMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: 'anthropic-messages',
    provider: 'anthropic',
    model: 'title-model',
    usage: ZERO_USAGE,
    stopReason: 'stop',
    timestamp: Date.now(),
  };
}

describe('shouldAssignGeneratedTitle', () => {
  it('only assigns when the title is still the default placeholder', () => {
    expect(shouldAssignGeneratedTitle(DEFAULT_ASSISTANT_TITLE)).toBe(true);
    expect(shouldAssignGeneratedTitle('MU 短线')).toBe(false);
    expect(shouldAssignGeneratedTitle('')).toBe(false);
  });
});

describe('sanitizeGeneratedTitle', () => {
  it('strips quotes, markdown, and extra lines, then caps length', () => {
    expect(sanitizeGeneratedTitle('"MU 短线观察"', 'fallback')).toBe('MU 短线观察');
    expect(sanitizeGeneratedTitle('**NVDA 财报**\n第二行', 'fallback')).toBe('NVDA 财报');
    expect(sanitizeGeneratedTitle('   标题   ', 'fallback')).toBe('标题');
  });

  it('falls back when the model returns empty or punctuation-only text', () => {
    expect(sanitizeGeneratedTitle('   ', 'fallback')).toBe('fallback');
    expect(sanitizeGeneratedTitle('"""', 'fallback')).toBe('fallback');
  });
});

describe('generateSessionTitle', () => {
  it('returns the sanitized model reply', async () => {
    const factory: AiAgentFactory = (config) => {
      const state = { messages: [...(config.messages ?? [])] };
      return {
        prompt: async () => {
          state.messages.push(assistant('"帮我看 MU 盘前"'));
        },
        abort: () => undefined,
        state,
      };
    };

    await expect(
      generateSessionTitle('帮我看一下 MU 盘前为什么涨', {
        model,
        agentFactory: factory,
      }),
    ).resolves.toBe('帮我看 MU 盘前');
  });

  it('falls back to the first 40 characters of the user text when no model is set', async () => {
    await expect(
      generateSessionTitle('  hello   world  \n there  ', { model: null }),
    ).resolves.toBe('hello world there');
  });

  it('falls back when the model call throws', async () => {
    const factory: AiAgentFactory = () => ({
      prompt: async () => {
        throw new Error('boom');
      },
      abort: () => undefined,
      state: { messages: [] },
    });

    await expect(
      generateSessionTitle('只看一句用户原文', { model, agentFactory: factory }),
    ).resolves.toBe('只看一句用户原文');
  });
});
