import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentEvent } from '@earendil-works/pi-agent-core';
import { attachAiUsageLogger } from '../src/ai/runtime/usage.js';

function usage(tokens: number, cost: number) {
  return {
    input: tokens,
    output: 10,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: tokens + 10,
    cost: { input: cost, output: 0, cacheRead: 0, cacheWrite: 0, total: cost },
  };
}

function fakeAgent() {
  const listeners: ((event: AgentEvent) => void)[] = [];
  return {
    subscribe(listener: (event: AgentEvent) => void) {
      listeners.push(listener);
      return () => {};
    },
    emit(event: AgentEvent) {
      for (const l of listeners) l(event);
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('attachAiUsageLogger', () => {
  it('logs each billable message and a run total', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const agent = fakeAgent();
    attachAiUsageLogger(agent, {
      layer: 'analyst',
      symbol: 'MU.US',
      model: { provider: 'anthropic', id: 'x' },
    });

    agent.emit({
      type: 'message_end',
      message: { role: 'assistant', usage: usage(100, 0.01) },
    } as unknown as AgentEvent);
    agent.emit({ type: 'agent_end', messages: [] } as unknown as AgentEvent);

    const lines = log.mock.calls.map((c) => String(c[0]));
    expect(
      lines.some(
        (l) => l.includes('[ai-usage]') && l.includes('call=1') && l.includes('tokens=110'),
      ),
    ).toBe(true);
    expect(lines.some((l) => l.includes('total calls=1') && l.includes('spend=$0.0100'))).toBe(
      true,
    );
  });

  it('skips messages without billable usage', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const agent = fakeAgent();
    attachAiUsageLogger(agent, { layer: 'commentator', symbol: 'MU.US', model: {} });

    agent.emit({ type: 'message_end', message: { role: 'user' } } as unknown as AgentEvent);
    agent.emit({
      type: 'message_end',
      message: { role: 'assistant', usage: usage(-10, 0) },
    } as unknown as AgentEvent);

    expect(log.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('call='))).toHaveLength(
      0,
    );
  });

  it('does nothing when the agent has no subscribe', () => {
    expect(() =>
      attachAiUsageLogger({}, { layer: 'analyst', symbol: 'MU.US', model: {} }),
    ).not.toThrow();
  });
});
