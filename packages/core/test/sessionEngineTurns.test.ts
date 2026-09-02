import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChartDoc } from '@kansoku/shared/types';
import type { AiAgentFactory, AiAgentPrompt } from '../src/ai/agents/agentSession.js';
import { stampSentAt } from '../src/ai/conversation/conversationShared.js';
import type { AiModel } from '../src/ai/runtime/models.js';

const ctx = vi.hoisted(() => {
  const base = process.env.TMPDIR ?? '/tmp/';
  const sep = base.endsWith('/') ? '' : '/';
  return {
    dir: `${base}${sep}session-engine-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  };
});

vi.mock('../src/platform/env.js', async () => {
  const actual =
    await vi.importActual<typeof import('../src/platform/env.js')>('../src/platform/env.js');
  return { ...actual, CHART_DATA_DIR: ctx.dir, PROJECT_ROOT: ctx.dir };
});

const { runChatTurn, toDisplayMessages } = await import('../src/ai/chat/chat.js');
const { getSessionByChartId, listMessages } = await import('../src/ai/chat/chatStore.js');
const { resetSessionMessagesEnginesForTests, sessionMessagesEngine } =
  await import('../src/ai/conversation/messages/messageEngine.js');

type ChatDeps = Parameters<typeof runChatTurn>[2];

const fakeModel = { provider: 'anthropic', id: 'claude-haiku-4-5' } as unknown as AiModel;

const assistantMessage = (text: string): AgentMessage => ({
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
});

const doc: ChartDoc = {
  id: 'chart-1',
  schema_version: 2,
  type: 'intraday',
  title: 'MU 短线',
  symbol: 'MU.US',
  created_at: '2026-07-05T14:00:00.000Z',
  updated_at: '2026-07-05T14:00:00.000Z',
  input: {},
  built: { kind: 'intraday' } as unknown as ChartDoc['built'],
};

const factory =
  (reply: string, userMessageOf: (input: AiAgentPrompt) => AgentMessage): AiAgentFactory =>
  (config) => {
    const state = { messages: [...(config.messages ?? [])] };
    return {
      prompt: async (input) => {
        state.messages.push(userMessageOf(input));
        await config.transformContext?.(state.messages);
        state.messages.push(assistantMessage(reply));
      },
      abort: () => {},
      state,
    };
  };

const deps = (agentFactory: AiAgentFactory): ChatDeps => ({
  model: fakeModel,
  loadChart: async () => doc,
  listComments: async () => [],
  fetchKline: async () => [],
  fetchNews: async () => [],
  now: () => 0,
  disciplineText: '# trading-discipline\n假纪律全文。',
  agentFactory,
});

const runTwoTurns = async (
  chartId: string,
  userMessageOf: (input: AiAgentPrompt) => AgentMessage,
) => {
  for (const [text, reply] of [
    ['第一问', '答一'],
    ['第二问', '答二'],
  ] as const) {
    const result = await runChatTurn(chartId, text, deps(factory(reply, userMessageOf)));
    expect(result.started).toBe(true);
    if (result.started) await result.done;
  }
  const session = await getSessionByChartId(chartId);
  if (!session) throw new Error('session missing');
  const rows = await listMessages(session.id);
  const engine = sessionMessagesEngine(session.id, () => {
    throw new Error('engine must already exist for the session');
  });
  return { rows, compiled: await engine.process(rows.map((row) => row.payload)) };
};

describe('session-scoped message engine across persisted turns', () => {
  afterEach(() => resetSessionMessagesEnginesForTests());

  it('keeps generation 0 and reuses the committed prefix when the agent sees the persisted user message', async () => {
    const { rows, compiled } = await runTwoTurns('session-engine-ok', (input) => {
      if (typeof input === 'string') throw new Error('expected the persisted message object');
      return input;
    });
    expect(rows.map((row) => row.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(compiled.generation).toBe(0);
    expect(compiled.stats.internalPrefixReuseRatio).toBe(0.75);
    expect((rows[0].payload as { content: string }).content).toBe(stampSentAt('第一问', 0));
    expect(
      toDisplayMessages(rows)
        .filter((row) => row.kind === 'user')
        .map((row) => row.text),
    ).toEqual(['第一问', '第二问']);
  });

  it('bumps the generation when the agent transcript diverges from the persisted user message', async () => {
    const { compiled } = await runTwoTurns('session-engine-drift', (input) => ({
      role: 'user',
      content: typeof input === 'string' ? input : (input as { content: string }).content,
      timestamp: 999,
    }));
    expect(compiled.generation).toBe(2);
  });
});
