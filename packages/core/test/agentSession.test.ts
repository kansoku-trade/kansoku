import type { AgentEvent, AgentMessage, AgentTool } from '@earendil-works/pi-agent-core';
import type { MutableModels } from '@earendil-works/pi-ai';
import { Type } from 'typebox';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AgentTimeoutError,
  createAgentSession,
  runtimeStreamFn,
  type AiAgentFactory,
} from '../src/ai/agents/agentSession.js';
import { setModelsRuntimeForTests } from '../src/ai/runtime/modelsRuntime.js';
import type { AiModel } from '../src/ai/runtime/models.js';

const fakeModel = { provider: 'anthropic', id: 'claude-haiku-4-5' } as unknown as AiModel;

const fakeTool: AgentTool = {
  name: 'noop',
  description: 'noop',
  label: 'Noop',
  parameters: Type.Object({}),
  execute: async () => ({ content: [], details: {} }),
};

const fakeMessage: AgentMessage = { role: 'user', content: 'hi', timestamp: 0 };

describe('runtimeStreamFn', () => {
  afterEach(() => {
    setModelsRuntimeForTests(null);
  });

  it("delegates to the runtime's streamSimple with the same args", () => {
    const spy = vi.fn();
    setModelsRuntimeForTests({ streamSimple: spy } as unknown as MutableModels);

    const fakeContext = { messages: [] } as unknown as Parameters<typeof runtimeStreamFn>[1];
    const options = { apiKey: undefined } as unknown as Parameters<typeof runtimeStreamFn>[2];
    runtimeStreamFn(fakeModel, fakeContext, options);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(fakeModel, fakeContext, options);
  });

  it('throws when no runtime has been initialized', () => {
    expect(() => runtimeStreamFn(fakeModel, {} as never, undefined)).toThrow(/not initialized/);
  });
});

describe('createAgentSession', () => {
  it('passes systemPrompt/model/tools/messages verbatim to the factory', () => {
    let received: Parameters<AiAgentFactory>[0] | undefined;
    const agentFactory: AiAgentFactory = (config) => {
      received = config;
      return { prompt: async () => {}, abort: () => {} };
    };

    createAgentSession({
      layer: 'chat',
      symbol: 'MU.US',
      model: fakeModel,
      systemPrompt: 'system prompt',
      tools: [fakeTool],
      messages: [fakeMessage],
      agentFactory,
    });

    expect(received?.systemPrompt).toBe('system prompt');
    expect(received?.model).toBe(fakeModel);
    expect(received?.tools).toEqual([fakeTool]);
    expect(received?.messages).toEqual([fakeMessage]);
  });

  it("forwards events emitted by the handle's subscribe to onEvent", () => {
    let listener: ((event: AgentEvent) => void) | undefined;
    const agentFactory: AiAgentFactory = () => ({
      prompt: async () => {},
      abort: () => {},
      subscribe: (l) => {
        listener = l;
        return () => {};
      },
    });

    const events: AgentEvent[] = [];
    createAgentSession({
      layer: 'chat',
      symbol: 'MU.US',
      model: fakeModel,
      systemPrompt: 'system prompt',
      tools: [],
      agentFactory,
      onEvent: (event) => events.push(event),
    });

    const event: AgentEvent = { type: 'agent_start' };
    listener?.(event);
    expect(events).toEqual([event]);
  });

  it('resolves runTurn when the prompt resolves', async () => {
    const agentFactory: AiAgentFactory = () => ({
      prompt: async () => {},
      abort: () => {},
    });
    const session = createAgentSession({
      layer: 'chat',
      symbol: 'MU.US',
      model: fakeModel,
      systemPrompt: 'system prompt',
      tools: [],
      agentFactory,
    });

    await expect(session.runTurn('hi', 1000)).resolves.toBeUndefined();
    expect(session.isDone()).toBe(true);
  });

  it('rejects with AgentTimeoutError, aborts the agent, and sets isDone on timeout', async () => {
    let aborted = false;
    const agentFactory: AiAgentFactory = () => ({
      prompt: () => new Promise<void>(() => {}),
      abort: () => {
        aborted = true;
      },
    });
    const session = createAgentSession({
      layer: 'chat',
      symbol: 'MU.US',
      model: fakeModel,
      systemPrompt: 'system prompt',
      tools: [],
      agentFactory,
    });

    await expect(session.runTurn('hi', 10)).rejects.toBeInstanceOf(AgentTimeoutError);
    expect(aborted).toBe(true);
    expect(session.isDone()).toBe(true);
  });

  it('supports sequential runTurn calls after a completed turn', async () => {
    const prompts: string[] = [];
    const agentFactory: AiAgentFactory = () => ({
      prompt: async (text: string) => {
        prompts.push(text);
      },
      abort: () => {},
    });
    const session = createAgentSession({
      layer: 'chat',
      symbol: 'MU.US',
      model: fakeModel,
      systemPrompt: 'system prompt',
      tools: [],
      agentFactory,
    });

    await session.runTurn('first', 1000);
    expect(session.isDone()).toBe(true);
    await session.runTurn('second', 1000);
    expect(session.isDone()).toBe(true);
    expect(prompts).toEqual(['first', 'second']);
  });

  it('rejects a concurrent runTurn while one is in flight, and the first turn still settles normally', async () => {
    let resolvePrompt: (() => void) | undefined;
    const agentFactory: AiAgentFactory = () => ({
      prompt: () =>
        new Promise<void>((resolve) => {
          resolvePrompt = resolve;
        }),
      abort: () => {},
    });
    const session = createAgentSession({
      layer: 'chat',
      symbol: 'MU.US',
      model: fakeModel,
      systemPrompt: 'system prompt',
      tools: [],
      agentFactory,
    });

    const firstTurn = session.runTurn('first', 1000);
    await expect(session.runTurn('second', 1000)).rejects.toThrow(/already in flight/);

    resolvePrompt?.();
    await expect(firstTurn).resolves.toBeUndefined();
    expect(session.isDone()).toBe(true);
  });
});
