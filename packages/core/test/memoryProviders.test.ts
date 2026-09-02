import type { AgentMessage } from '@earendil-works/pi-agent-core';
import type { ProAiMemory } from '@kansoku/pro-api';
import { afterEach, describe, expect, it } from 'vitest';
import {
  memoryProcessors,
  memoryReadMounts,
} from '../src/ai/conversation/messages/memoryProviders.js';
import { MessagesEngine } from '../src/ai/conversation/messages/messageEngine.js';
import { registerProAiMemory, resetProAiMemoryForTests } from '../src/pro/aiMemory.js';

const user = (text: string, timestamp: number): AgentMessage => ({
  role: 'user',
  content: text,
  timestamp,
});
const assistant = (text: string): AgentMessage =>
  ({
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: 'anthropic-messages',
    provider: 'anthropic',
    model: 'test-model',
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop',
    timestamp: 0,
  }) as AgentMessage;

const textOfMessage = (message: AgentMessage): string => {
  const content = (message as { content: unknown }).content;
  if (typeof content === 'string') return content;
  return (content as Array<{ text?: string }>).map((part) => part.text ?? '').join('');
};

function fakeMemory(): ProAiMemory & { calls: { index: number; scope: string[] } } {
  const calls = { index: 0, scope: [] as string[] };
  return {
    calls,
    indexContext: async () => {
      calls.index += 1;
      return '<persistent_memory>偏好：控制回撤</persistent_memory>';
    },
    scopeContext: async (scope) => {
      calls.scope.push(`${scope.symbol ?? ''}|${scope.market ?? ''}`);
      return `<persistent_memory>symbol=${scope.symbol}</persistent_memory>`;
    },
    readMount: () => ({ name: 'memory', root: '/tmp/memory', include: ['**/*.md'] }),
    writeMount: () => undefined,
  };
}

afterEach(() => resetProAiMemoryForTests());

describe('memory providers', () => {
  it('contributes nothing when no Pro memory is registered', () => {
    expect(memoryProcessors()).toEqual([]);
    expect(memoryReadMounts()).toEqual([]);
  });

  it('injects the index once per session and pins scope memory to the message where the symbol appeared', async () => {
    const memory = fakeMemory();
    registerProAiMemory(memory);
    const engine = new MessagesEngine(memoryProcessors(), 'memory-session');
    engine.setStep({ symbol: 'MU.US', market: 'US' });

    const first = await engine.process([user('第一问', 1)]);
    const firstTexts = first.messages.map(textOfMessage);
    expect(firstTexts.some((text) => text.includes('偏好：控制回撤'))).toBe(true);
    expect(firstTexts.at(-1)).toContain('symbol=MU.US');
    expect(firstTexts.at(-1)).toContain('SYSTEM CONTEXT');

    const second = await engine.process([user('第一问', 1), assistant('答'), user('第二问', 2)]);
    const secondTexts = second.messages.map(textOfMessage);
    expect(secondTexts.filter((text) => text.includes('symbol=MU.US'))).toHaveLength(1);
    expect(secondTexts.find((text) => text.startsWith('第一问'))).toContain('symbol=MU.US');
    expect(secondTexts.find((text) => text.startsWith('第二问'))).not.toContain('symbol=');

    engine.setStep({ symbol: 'NVDA.US', market: 'US' });
    const third = await engine.process([
      user('第一问', 1),
      assistant('答'),
      user('第二问', 2),
      assistant('答'),
      user('换 NVDA', 3),
    ]);
    const thirdTexts = third.messages.map(textOfMessage);
    expect(thirdTexts.find((text) => text.startsWith('第一问'))).toContain('symbol=MU.US');
    expect(thirdTexts.find((text) => text.startsWith('换 NVDA'))).toContain('symbol=NVDA.US');

    expect(memory.calls.index).toBe(1);
    expect(memory.calls.scope).toEqual(['MU.US|US', 'NVDA.US|US']);
    expect(memoryReadMounts()).toEqual([
      { name: 'memory', root: '/tmp/memory', include: ['**/*.md'] },
    ]);
  });

  it('fails open when the Pro memory cannot be read', async () => {
    registerProAiMemory({
      indexContext: async () => {
        throw new Error('disk gone');
      },
      scopeContext: async () => {
        throw new Error('disk gone');
      },
      readMount: () => undefined,
      writeMount: () => undefined,
    });
    const engine = new MessagesEngine(memoryProcessors(), 'memory-broken');
    engine.setStep({ symbol: 'MU.US' });
    const result = await engine.process([user('问', 1)]);
    expect(result.messages.map(textOfMessage).join('\n')).not.toContain('persistent_memory');
    expect(memoryReadMounts()).toEqual([]);
  });
});
