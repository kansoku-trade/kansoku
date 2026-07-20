import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChartDoc } from '@kansoku/shared/types';
import type { AiModel } from '@kansoku/core/ai/runtime/models';
import { tsukiRequest } from './helpers.js';

const ctx = vi.hoisted(() => {
  const base = process.env.TMPDIR ?? '/tmp/';
  const sep = base.endsWith('/') ? '' : '/';
  const dir = `${base}${sep}chat-routes-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { dir };
});

vi.mock('@kansoku/core/platform/env', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  CHART_DATA_DIR: ctx.dir,
}));

const store = vi.hoisted(() => ({ loadChart: vi.fn(), listCharts: vi.fn() }));
vi.mock('@kansoku/core/charts/store', () => store);

const { setChatDepsForTests, setChatSuggestionDepsForTests } =
  await import('../src/modules/chat/chat.controller.js');
const { createSession, appendMessages } = await import('@kansoku/core/ai/chat/chatStore');
const { clearChatSuggestionCache } = await import('@kansoku/core/ai/chat/chatSuggestions');

type ChatDeps = import('@kansoku/core/ai/chat/chat').ChatDeps;

const fakeModel = { provider: 'anthropic', id: 'claude-haiku-4-5' } as unknown as AiModel;

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

function baseDeps(overrides: Partial<ChatDeps> = {}): ChatDeps {
  return {
    model: fakeModel,
    loadChart: async () => fakeDoc(),
    listComments: async () => [],
    buildPack: async () => {
      throw new Error('buildPack should not be invoked');
    },
    fetchKline: async () => [],
    fetchNews: async () => [],
    now: () => 0,
    agentFactory: () => ({ prompt: async () => {}, abort: () => {}, state: { messages: [] } }),
    ...overrides,
  } as ChatDeps;
}

const BASE = '/api/charts';

async function get(path: string): Promise<Response> {
  return tsukiRequest(`${BASE}${path}`);
}

async function post(path: string, payload: unknown): Promise<Response> {
  return tsukiRequest(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

beforeEach(() => {
  store.loadChart.mockReset();
  setChatDepsForTests(null);
  setChatSuggestionDepsForTests(null);
  clearChatSuggestionCache();
});

describe('GET /:id/chat', () => {
  it('404s when the chart does not exist', async () => {
    store.loadChart.mockResolvedValue(null);
    const res = await get('/missing-chart/chat');
    expect(res.status).toBe(404);
  });

  it('404s when the chart is not an intraday chart', async () => {
    store.loadChart.mockResolvedValue(
      fakeDoc({ built: { kind: 'sepa' } as unknown as ChartDoc['built'] }),
    );
    const res = await get('/chart-1/chat');
    expect(res.status).toBe(404);
  });

  it('returns session: null and empty messages when no chat has started', async () => {
    const chartId = 'chart-no-session';
    store.loadChart.mockResolvedValue(fakeDoc({ id: chartId }));
    const res = await get(`/${chartId}/chat`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ session: null, messages: [], busy: false, partial: '' });
  });

  it('returns the session, display messages, and idle busy/partial', async () => {
    const chartId = 'chart-with-history';
    store.loadChart.mockResolvedValue(fakeDoc({ id: chartId }));
    const session = await createSession({ chartId, symbol: 'MU.US', title: '你好' });
    await appendMessages(session.id, [
      { role: 'user', content: '你好', timestamp: 0 },
      assistantMessage('你好呀'),
    ]);

    const res = await get(`/${chartId}/chat`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.session.chartId).toBe(chartId);
    expect(body.busy).toBe(false);
    expect(body.partial).toBe('');
    expect(body.messages).toEqual([
      { id: expect.any(String), ts: expect.any(String), kind: 'user', text: '你好' },
      { id: expect.any(String), ts: expect.any(String), kind: 'assistant', text: '你好呀' },
    ]);
  });

  it('reports busy + partial while a turn is in flight', async () => {
    const chartId = 'chart-busy';
    store.loadChart.mockResolvedValue(fakeDoc({ id: chartId }));

    let releasePrompt: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releasePrompt = resolve;
    });
    let signalStarted: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });

    setChatDepsForTests(
      baseDeps({
        loadChart: async () => fakeDoc({ id: chartId }),
        agentFactory: () => ({
          prompt: async () => {
            signalStarted();
            await gate;
          },
          abort: () => {},
          state: { messages: [] },
        }),
      }),
    );

    const postPromise = post(`/${chartId}/chat/messages`, { text: '在忙吗' });
    await started;

    const res = await get(`/${chartId}/chat`);
    expect(res.status).toBe(200);
    expect((await res.json()).busy).toBe(true);

    releasePrompt();
    const postRes = await postPromise;
    expect(postRes.status).toBe(202);
  });
});

describe('POST /:id/chat/messages', () => {
  it('rejects empty, whitespace-only, or overly long text with 400', async () => {
    setChatDepsForTests(baseDeps());
    const empty = await post('/chart-1/chat/messages', { text: '' });
    expect(empty.status).toBe(400);
    const whitespace = await post('/chart-1/chat/messages', { text: '   ' });
    expect(whitespace.status).toBe(400);
    const tooLong = await post('/chart-1/chat/messages', { text: 'a'.repeat(4001) });
    expect(tooLong.status).toBe(400);
  });

  it('returns 202 accepted when a turn starts', async () => {
    const chartId = 'chart-post-202';
    setChatDepsForTests(baseDeps({ loadChart: async () => fakeDoc({ id: chartId }) }));
    const res = await post(`/${chartId}/chat/messages`, { text: '你好' });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ accepted: true });
  });

  it('returns 409 when a turn is already in flight for the chart', async () => {
    const chartId = 'chart-post-409';
    let releasePrompt: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releasePrompt = resolve;
    });
    let signalStarted: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });

    setChatDepsForTests(
      baseDeps({
        loadChart: async () => fakeDoc({ id: chartId }),
        agentFactory: () => ({
          prompt: async () => {
            signalStarted();
            await gate;
          },
          abort: () => {},
          state: { messages: [] },
        }),
      }),
    );

    const first = post(`/${chartId}/chat/messages`, { text: '第一条' });
    await started;

    const second = await post(`/${chartId}/chat/messages`, { text: '第二条' });
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: '上一条还在回答中' });

    releasePrompt();
    const firstRes = await first;
    expect(firstRes.status).toBe(202);
  });

  it('returns 404 when the chart does not exist', async () => {
    setChatDepsForTests(baseDeps({ loadChart: async () => null }));
    const res = await post('/missing-chart/chat/messages', { text: '你好' });
    expect(res.status).toBe(404);
  });

  it('returns 404 when the chart is not an intraday chart', async () => {
    setChatDepsForTests(
      baseDeps({
        loadChart: async () => fakeDoc({ built: { kind: 'sepa' } as unknown as ChartDoc['built'] }),
      }),
    );
    const res = await post('/chart-1/chat/messages', { text: '你好' });
    expect(res.status).toBe(404);
  });

  it('returns 503 when no chat model is configured', async () => {
    setChatDepsForTests(baseDeps({ model: null }));
    const res = await post('/chart-1/chat/messages', { text: '你好' });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: '未配置追问模型，请在 /settings 配置' });
  });
});

describe('POST /:id/chat/abort', () => {
  it('404s when the chart does not exist', async () => {
    store.loadChart.mockResolvedValue(null);
    const res = await post('/missing-chart/chat/abort', {});
    expect(res.status).toBe(404);
  });

  it('409s when no turn is running', async () => {
    store.loadChart.mockResolvedValue(fakeDoc({ id: 'chart-abort-idle' }));
    const res = await post('/chart-abort-idle/chat/abort', {});
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: '当前没有正在生成的回答' });
  });

  it('202s and stops the in-flight turn', async () => {
    const chartId = 'chart-abort-202';
    store.loadChart.mockResolvedValue(fakeDoc({ id: chartId }));

    let signalStarted: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    let rejectPrompt: ((err: Error) => void) | undefined;

    setChatDepsForTests(
      baseDeps({
        loadChart: async () => fakeDoc({ id: chartId }),
        agentFactory: () => ({
          prompt: () =>
            new Promise((_resolve, reject) => {
              rejectPrompt = reject;
              signalStarted();
            }),
          abort: () => rejectPrompt?.(new Error('aborted')),
          state: { messages: [] },
        }),
      }),
    );

    const accepted = await post(`/${chartId}/chat/messages`, { text: '你好' });
    expect(accepted.status).toBe(202);
    await started;

    const res = await post(`/${chartId}/chat/abort`, {});
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ aborted: true });
  });
});

describe('GET /:id/chat/suggestions', () => {
  it('404s when the chart does not exist', async () => {
    store.loadChart.mockResolvedValue(null);
    const res = await get('/missing-chart/chat/suggestions');
    expect(res.status).toBe(404);
  });

  it('returns generated questions when no chat has started', async () => {
    const chartId = 'chart-suggest';
    store.loadChart.mockResolvedValue(fakeDoc({ id: chartId }));
    setChatSuggestionDepsForTests({
      model: fakeModel,
      loadChart: async () => fakeDoc({ id: chartId }),
      listComments: async () => [],
      agentFactory: (config) => ({
        prompt: async () => {
          await config.tools[0].execute('call-1', {
            questions: ['凭什么偏空', '失效位怎么来的', '量能对比哪几根'],
          } as never);
        },
        abort: () => {},
        state: { messages: [] },
      }),
    });

    const res = await get(`/${chartId}/chat/suggestions`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      suggestions: ['凭什么偏空', '失效位怎么来的', '量能对比哪几根'],
    });
  });

  it('returns nothing once a chat session exists', async () => {
    const chartId = 'chart-suggest-existing';
    store.loadChart.mockResolvedValue(fakeDoc({ id: chartId }));
    await createSession({ chartId, symbol: 'MU.US', title: '已经聊过' });

    const res = await get(`/${chartId}/chat/suggestions`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ suggestions: [] });
  });
});
