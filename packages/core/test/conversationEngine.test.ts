import type { AgentEvent, AgentMessage } from '@earendil-works/pi-agent-core';
import { describe, expect, it } from 'vitest';
import type { AiAgentFactory } from '../src/ai/agents/agentSession.js';
import {
  type ConversationEvent,
  type ConversationPreparedTurn,
  type ConversationTurnPlan,
  createConversationEngine,
} from '../src/ai/conversation/conversationEngine.js';
import type { ConversationMessageRow } from '../src/ai/conversation/conversationStore.js';
import type { AiModel } from '../src/ai/runtime/models.js';

const fakeModel = {
  api: 'anthropic-messages',
  provider: 'anthropic',
  id: 'test-model',
} as unknown as AiModel;

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
    timestamp: 0,
  };
}

function messageStartEvent(): AgentEvent {
  return { type: 'message_start', message: assistantMessage('') };
}

function messageUpdateEvent(fullText: string): AgentEvent {
  const message = assistantMessage(fullText);
  return {
    type: 'message_update',
    message,
    assistantMessageEvent: {
      type: 'text_delta',
      contentIndex: 0,
      delta: fullText,
      partial: message as never,
    },
  };
}

function memoryStore() {
  const rows: ConversationMessageRow[] = [];
  let session: { id: string } | null = null;
  const titles: string[] = [];
  return {
    rows,
    titles,
    adapter: {
      getSession: async () => session,
      createSession: async (title: string) => {
        titles.push(title);
        session = { id: 's1' };
        return session;
      },
      listMessages: async () => [...rows],
      appendMessages: async (sessionId: string, messages: AgentMessage[]) => {
        for (const message of messages) {
          rows.push({
            id: `r${rows.length + 1}`,
            sessionId,
            ts: 't',
            role: message.role,
            payload: message,
          });
        }
      },
    },
  };
}

type EngineInput = ConversationPreparedTurn | 'reject' | 'throw';

function makeEngine() {
  return createConversationEngine<EngineInput, 'nope'>({
    layer: 'chat',
    logLabels: {
      persistFailure: 'engine-test: persist failure',
      preTurnFailure: 'engine-test: pre-turn failure',
    },
    prepare: async (_key, _text, input) => {
      if (input === 'reject') return { ok: false, reason: 'nope' };
      if (input === 'throw') throw new Error('prep-boom');
      return { ok: true, turn: input };
    },
  });
}

function makeTurn(
  store: ReturnType<typeof memoryStore>,
  factory: AiAgentFactory,
  plan: Partial<ConversationTurnPlan> = {},
  overrides: Partial<ConversationPreparedTurn> = {},
): ConversationPreparedTurn {
  return {
    model: fakeModel,
    store: store.adapter,
    agentFactory: factory,
    timeoutMs: 500,
    now: () => 0,
    buildTurn: async () => ({ symbol: 'MU.US', systemPrompt: 'sp', tools: [], ...plan }),
    ...overrides,
  };
}

function noopFactory(): AiAgentFactory {
  return (config) => ({
    prompt: async () => {},
    abort: () => {},
    state: { messages: [...(config.messages ?? [])] },
  });
}

describe('createConversationEngine lock', () => {
  it('rejects a second run while one is in flight, then allows a new turn once it settles', async () => {
    const engine = makeEngine();
    const store = memoryStore();
    let resolvePrompt: (() => void) | undefined;
    let notifyPromptCalled: (() => void) | undefined;
    const promptCalled = new Promise<void>((resolve) => {
      notifyPromptCalled = resolve;
    });
    const factory: AiAgentFactory = (config) => ({
      prompt: () =>
        new Promise<void>((resolve) => {
          resolvePrompt = resolve;
          notifyPromptCalled?.();
        }),
      abort: () => {},
      state: { messages: [...(config.messages ?? [])] },
    });

    const first = await engine.run('k1', 'first', makeTurn(store, factory));
    expect(first.started).toBe(true);
    expect(await engine.run('k1', 'second', makeTurn(store, factory))).toEqual({
      started: false,
      reason: 'busy',
    });

    await promptCalled;
    expect(engine.turnState('k1').busy).toBe(true);
    resolvePrompt?.();
    if (first.started) await first.done;

    expect(engine.turnState('k1')).toEqual({ busy: false, partial: '' });
    const third = await engine.run('k1', 'third', makeTurn(store, noopFactory()));
    expect(third.started).toBe(true);
    if (third.started) await third.done;
  });

  it('releases the lock when prepare returns a domain reason or throws', async () => {
    const engine = makeEngine();
    const store = memoryStore();

    expect(await engine.run('k2', 'hi', 'reject')).toEqual({ started: false, reason: 'nope' });
    await expect(engine.run('k2', 'hi', 'throw')).rejects.toThrow('prep-boom');

    const ok = await engine.run('k2', 'hi', makeTurn(store, noopFactory()));
    expect(ok.started).toBe(true);
    if (ok.started) await ok.done;
  });
});

describe('createConversationEngine persistence', () => {
  it('creates the session with a derived title and persists user + assistant increment', async () => {
    const engine = makeEngine();
    const store = memoryStore();
    const reply = assistantMessage('答案');
    const factory: AiAgentFactory = (config) => ({
      prompt: async () => {},
      abort: () => {},
      state: {
        messages: [
          ...(config.messages ?? []),
          { role: 'user', content: '问题', timestamp: 0 },
          reply,
        ],
      },
    });

    const events: ConversationEvent[] = [];
    const unsub = engine.onEvent('k3', (e) => events.push(e));
    const result = await engine.run('k3', '  问题  换行 ', makeTurn(store, factory));
    expect(result.started).toBe(true);
    if (result.started) await result.done;
    unsub();

    expect(store.titles).toEqual(['问题 换行']);
    expect(store.rows.map((r) => r.role)).toEqual(['user', 'assistant']);
    expect(store.rows[0].payload).toEqual({ role: 'user', content: '  问题  换行 ', timestamp: 0 });
    expect(store.rows[1].payload).toEqual(reply);
    expect(events).toEqual([{ event: 'done' }]);
  });

  it('notifies the non-blocking after-turn hook with the persisted visible turn', async () => {
    const engine = makeEngine();
    const store = memoryStore();
    const completed: AgentMessage[][] = [];
    const reply = assistantMessage('持久回答');
    const factory: AiAgentFactory = (config) => ({
      prompt: async () => {},
      abort: () => {},
      state: {
        messages: [
          ...(config.messages ?? []),
          { role: 'user', content: '记住这个偏好', timestamp: 0 },
          reply,
        ],
      },
    });

    const result = await engine.run(
      'after-turn',
      '记住这个偏好',
      makeTurn(store, factory, {
        onTurnComplete: (messages) => completed.push([...messages]),
      }),
    );
    if (result.started) await result.done;

    expect(completed).toEqual([[{ role: 'user', content: '记住这个偏好', timestamp: 0 }, reply]]);
  });

  it('synthesizes a partial assistant row when the turn fails after streaming', async () => {
    const engine = makeEngine();
    const store = memoryStore();
    const events: ConversationEvent[] = [];
    const unsub = engine.onEvent('k4', (e) => events.push(e));

    const factory: AiAgentFactory = (config) => {
      let listener: ((event: AgentEvent) => void) | undefined;
      return {
        prompt: () => {
          listener?.(messageStartEvent());
          listener?.(messageUpdateEvent('部分回答'));
          return Promise.reject(new Error('boom'));
        },
        abort: () => {},
        subscribe: (l) => {
          listener = l;
          return () => {
            listener = undefined;
          };
        },
        state: { messages: [...(config.messages ?? [])] },
      };
    };

    const result = await engine.run('k4', '问', makeTurn(store, factory));
    expect(result.started).toBe(true);
    if (result.started) await result.done;
    unsub();

    expect(events).toEqual([
      { event: 'delta', text: '部分回答' },
      { event: 'error', message: 'boom' },
    ]);
    expect(store.rows.map((r) => r.role)).toEqual(['user', 'assistant']);
    expect(store.rows[1].payload).toEqual({
      role: 'assistant',
      content: [{ type: 'text', text: '部分回答' }],
      api: 'anthropic-messages',
      provider: 'anthropic',
      model: 'test-model',
      usage: ZERO_USAGE,
      stopReason: 'aborted',
      timestamp: 0,
    });
  });

  it('emits a timeout error naming the configured timeout', async () => {
    const engine = makeEngine();
    const store = memoryStore();
    const events: ConversationEvent[] = [];
    const unsub = engine.onEvent('k5', (e) => events.push(e));

    const hangFactory: AiAgentFactory = (config) => ({
      prompt: () => new Promise<void>(() => {}),
      abort: () => {},
      state: { messages: [...(config.messages ?? [])] },
    });

    const result = await engine.run(
      'k5',
      '问',
      makeTurn(store, hangFactory, {}, { timeoutMs: 10 }),
    );
    expect(result.started).toBe(true);
    if (result.started) await result.done;
    unsub();

    expect(events).toEqual([{ event: 'error', message: '回答超时（10ms）' }]);
  });
});

describe('createConversationEngine abort', () => {
  it('broadcasts aborted, persists the failure increment, and clears the turn', async () => {
    const engine = makeEngine();
    const store = memoryStore();
    const events: ConversationEvent[] = [];
    const unsub = engine.onEvent('k6', (e) => events.push(e));

    let rejectPrompt: ((err: Error) => void) | undefined;
    let abortAccepted = false;
    const factory: AiAgentFactory = (config) => {
      let listener: ((event: AgentEvent) => void) | undefined;
      return {
        prompt: () =>
          new Promise((_resolve, reject) => {
            rejectPrompt = reject;
            listener?.(messageStartEvent());
            listener?.(messageUpdateEvent('半截话'));
            queueMicrotask(() => {
              abortAccepted = engine.abort('k6');
            });
          }),
        abort: () => rejectPrompt?.(new Error('aborted')),
        subscribe: (l) => {
          listener = l;
          return () => {
            listener = undefined;
          };
        },
        state: { messages: [...(config.messages ?? [])] },
      };
    };

    const result = await engine.run('k6', '问', makeTurn(store, factory));
    expect(result.started).toBe(true);
    if (result.started) await result.done;
    unsub();

    expect(abortAccepted).toBe(true);
    expect(events.at(-1)).toEqual({ event: 'aborted' });
    expect(events.some((e) => e.event === 'error')).toBe(false);
    expect(store.rows.map((r) => r.role)).toEqual(['user', 'assistant']);
    expect((store.rows[1].payload as { content: { text?: string }[] }).content).toEqual([
      { type: 'text', text: '半截话' },
    ]);
    expect(engine.turnState('k6')).toEqual({ busy: false, partial: '' });
  });

  it('returns false when no turn is running', () => {
    expect(makeEngine().abort('idle')).toBe(false);
  });
});

describe('createConversationEngine translation', () => {
  it('streams deltas and tool events live on an ungated turn', async () => {
    const engine = makeEngine();
    const store = memoryStore();
    const events: ConversationEvent[] = [];
    const unsub = engine.onEvent('k7', (e) => events.push(e));
    let observedPartial = '';

    const factory: AiAgentFactory = (config) => {
      let listener: ((event: AgentEvent) => void) | undefined;
      const messages: AgentMessage[] = [...(config.messages ?? [])];
      return {
        prompt: async () => {
          listener?.(messageStartEvent());
          listener?.(messageUpdateEvent('Hi'));
          listener?.(messageUpdateEvent('Hi there'));
          observedPartial = engine.turnState('k7').partial;
          listener?.({
            type: 'tool_execution_start',
            toolCallId: 'c1',
            toolName: 'fetch_news',
            args: { limit: 5 },
          });
          listener?.({
            type: 'tool_execution_end',
            toolCallId: 'c1',
            toolName: 'fetch_news',
            result: { content: [{ type: 'text', text: '两条新闻' }] },
            isError: false,
          });
          messages.push(
            { role: 'user', content: '问', timestamp: 0 },
            assistantMessage('Hi there'),
          );
        },
        abort: () => {},
        subscribe: (l) => {
          listener = l;
          return () => {
            listener = undefined;
          };
        },
        state: { messages },
      };
    };

    const result = await engine.run('k7', '问', makeTurn(store, factory));
    expect(result.started).toBe(true);
    if (result.started) await result.done;
    unsub();

    expect(events).toEqual([
      { event: 'delta', text: 'Hi' },
      { event: 'delta', text: ' there' },
      { event: 'tool', label: 'fetch_news', status: 'start', input: '{"limit":5}' },
      { event: 'tool', label: 'fetch_news', status: 'end', output: '两条新闻' },
      { event: 'done' },
    ]);
    expect(observedPartial).toBe('Hi there');
  });

  it('suppresses live deltas but keeps tool events on a gated turn, then emits the settled answer', async () => {
    const engine = makeEngine();
    const store = memoryStore();
    const events: ConversationEvent[] = [];
    const unsub = engine.onEvent('k8', (e) => events.push(e));

    let answer: string | null = null;
    const prompts: string[] = [];
    const factory: AiAgentFactory = (config) => {
      let listener: ((event: AgentEvent) => void) | undefined;
      const messages: AgentMessage[] = [...(config.messages ?? [])];
      return {
        prompt: async (text: string) => {
          prompts.push(text);
          listener?.(messageStartEvent());
          listener?.(messageUpdateEvent('未核验的自由文本'));
          listener?.({
            type: 'tool_execution_start',
            toolCallId: 'c1',
            toolName: 'verify',
            args: {},
          });
          listener?.({
            type: 'tool_execution_end',
            toolCallId: 'c1',
            toolName: 'verify',
            result: { content: [{ type: 'text', text: 'ok' }] },
            isError: false,
          });
          if (prompts.length === 2) answer = '核验后的回答';
          messages.push(
            { role: 'user', content: text, timestamp: 0 },
            assistantMessage('未核验的自由文本'),
          );
        },
        abort: () => {},
        subscribe: (l) => {
          listener = l;
          return () => {
            listener = undefined;
          };
        },
        state: { messages },
      };
    };

    const gate = {
      instruction: 'GATED-INSTR',
      retryInstruction: 'RETRY-INSTR',
      failClosedMessage: '已拦截',
      answer: () => answer,
    };
    const result = await engine.run('k8', '突破了吗', makeTurn(store, factory, { gate }));
    expect(result.started).toBe(true);
    if (result.started) await result.done;
    unsub();

    expect(prompts).toEqual(['突破了吗\n\nGATED-INSTR', 'RETRY-INSTR']);
    expect(events.filter((e) => e.event === 'tool')).toHaveLength(4);
    expect(events.filter((e) => e.event === 'delta')).toEqual([
      { event: 'delta', text: '核验后的回答' },
    ]);
    expect(events.at(-1)).toEqual({ event: 'done' });
    expect(store.rows.at(-1)?.payload).toMatchObject({
      role: 'assistant',
      content: [{ type: 'text', text: '核验后的回答' }],
      stopReason: 'stop',
    });
  });

  it('skips the retry when the gate passes on the first turn', async () => {
    const engine = makeEngine();
    const store = memoryStore();
    const prompts: string[] = [];
    const factory: AiAgentFactory = (config) => ({
      prompt: async (text: string) => {
        prompts.push(text);
      },
      abort: () => {},
      state: { messages: [...(config.messages ?? [])] },
    });

    const gate = {
      instruction: 'GATED-INSTR',
      retryInstruction: 'RETRY-INSTR',
      failClosedMessage: '已拦截',
      answer: () => '直接过',
    };
    const result = await engine.run('k9', '突破了吗', makeTurn(store, factory, { gate }));
    expect(result.started).toBe(true);
    if (result.started) await result.done;

    expect(prompts).toEqual(['突破了吗\n\nGATED-INSTR']);
  });

  it('fails closed with the gate message after exactly one retry when the answer never lands', async () => {
    const engine = makeEngine();
    const store = memoryStore();
    const events: ConversationEvent[] = [];
    const unsub = engine.onEvent('k10', (e) => events.push(e));

    const prompts: string[] = [];
    const factory: AiAgentFactory = (config) => ({
      prompt: async (text: string) => {
        prompts.push(text);
      },
      abort: () => {},
      state: {
        messages: [
          ...(config.messages ?? []),
          { role: 'user', content: 'x', timestamp: 0 },
          assistantMessage('裸答'),
        ],
      },
    });

    const gate = {
      instruction: 'GATED-INSTR',
      retryInstruction: 'RETRY-INSTR',
      failClosedMessage: '回答未通过核验，已拦截',
      answer: () => null,
    };
    const result = await engine.run('k10', '见底了吗', makeTurn(store, factory, { gate }));
    expect(result.started).toBe(true);
    if (result.started) await result.done;
    unsub();

    expect(prompts).toEqual(['见底了吗\n\nGATED-INSTR', 'RETRY-INSTR']);
    expect(events).toEqual([{ event: 'error', message: '回答未通过核验，已拦截' }]);
    expect(store.rows.map((r) => r.role)).toEqual(['user', 'assistant']);
  });
});
