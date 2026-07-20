import type { AgentMessage } from '@earendil-works/pi-agent-core';
import type { ProAiCompletedTurn, ProModule } from '@kansoku/pro-api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessagesEngine } from '../src/ai/conversation/messages/messageEngine.js';
import { prepareProAiTurn } from '../src/pro/aiExtension.js';
import { freeHooks, registerProModule, unregisterProModuleForTests } from '../src/pro/registry.js';

const ZERO_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function assistantMessage(text: string): AgentMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: 'anthropic-messages',
    provider: 'anthropic',
    model: 'test-model',
    usage: ZERO_USAGE,
    stopReason: 'stop',
    timestamp: 1,
  };
}

afterEach(() => unregisterProModuleForTests());

describe('prepareProAiTurn', () => {
  it('adapts Pro prompt context, read mounts, and completed transcripts into Core', async () => {
    const completed: ProAiCompletedTurn[] = [];
    const module: ProModule = {
      hooks: freeHooks,
      aiExtension: {
        prepareTurn: async () => ({
          promptContext: '<persistent_memory>偏好：控制回撤</persistent_memory>',
          readMounts: [{ name: 'memory', root: '/tmp/memory', include: ['**/*.md'] }],
        }),
        afterTurn: async (turn) => {
          completed.push(turn);
        },
      },
    };
    registerProModule(module);

    const prepared = await prepareProAiTurn({
      surface: 'assistant',
      sessionId: 'session-1',
    });
    expect(prepared.readMounts).toEqual([
      { name: 'memory', root: '/tmp/memory', include: ['**/*.md'] },
    ]);

    const viewed = await new MessagesEngine(prepared.processors).process([
      { role: 'user', content: '分析当前情况', timestamp: 0 },
    ]);
    expect(JSON.stringify(viewed.messages)).toContain('偏好：控制回撤');
    expect(JSON.stringify(viewed.messages)).toContain('SYSTEM CONTEXT');

    prepared.onTurnComplete?.([
      { role: 'user', content: '以后控制回撤', timestamp: 0 },
      assistantMessage('已了解'),
    ]);
    await vi.waitFor(() => expect(completed).toHaveLength(1));
    expect(completed[0]).toEqual({
      surface: 'assistant',
      sessionId: 'session-1',
      messages: [
        { role: 'user', text: '以后控制回撤' },
        { role: 'assistant', text: '已了解' },
      ],
    });
  });

  it('fails open when the optional Pro extension cannot prepare memory', async () => {
    registerProModule({
      hooks: freeHooks,
      aiExtension: {
        prepareTurn: async () => {
          throw new Error('disk unavailable');
        },
      },
    });

    await expect(
      prepareProAiTurn({ surface: 'chart-chat', sessionId: 'session-2' }),
    ).resolves.toEqual({ readMounts: [], processors: [] });
  });
});
