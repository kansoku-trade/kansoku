import type { ChartDoc } from '@kansoku/shared/types';
import {
  abortChatTurn,
  type ChatDeps,
  chatTurnState,
  runChatTurn,
  toDisplayMessages,
} from './chat.js';
import { getSessionByChartId, listMessages } from './chatStore.js';
import { buildChatSuggestions, type ChatSuggestionDeps } from './chatSuggestions.js';
import { aiConfig } from '../runtime/models.js';
import type { ChatApi } from '../../contract/chat.js';
import { ClientError } from '../../platform/errors.js';
import { loadChart } from '../../charts/store.js';

const MAX_TEXT_LENGTH = 4000;

function isIntradayChart(doc: ChartDoc): boolean {
  return doc.built.kind === 'intraday' && !!doc.symbol;
}

let testDeps: ChatDeps | null = null;
let testSuggestionDeps: ChatSuggestionDeps | null = null;

export function setChatDepsForTests(deps: ChatDeps | null): void {
  testDeps = deps;
}

export function setChatSuggestionDepsForTests(deps: ChatSuggestionDeps | null): void {
  testSuggestionDeps = deps;
}

function buildDeps(): ChatDeps {
  return testDeps ?? { model: aiConfig().chatModel };
}

export const chatService: ChatApi = {
  async get(input) {
    const doc = await loadChart(input.id);
    if (!doc || !isIntradayChart(doc)) {
      throw new ClientError(
        `chart not found: ${input.id}`,
        'GET /api/charts lists available ids',
        404,
      );
    }
    const session = await getSessionByChartId(input.id);
    const messages = session ? toDisplayMessages(await listMessages(session.id)) : [];
    const { busy, partial } = chatTurnState(input.id);
    return { session, messages, busy, partial };
  },

  async postMessage(input) {
    if (!input.text.trim() || input.text.length > MAX_TEXT_LENGTH) {
      throw new ClientError(
        '`text` must be a non-empty string of at most 4000 characters',
        'e.g. {"text": "..."}',
      );
    }

    const result = await runChatTurn(input.id, input.text, buildDeps());
    if (result.started) {
      result.done.catch((err) => console.error('chat: turn failed', err));
      return { status: 202, body: { accepted: true } };
    }
    if (result.reason === 'busy') {
      return { status: 409, body: { error: '上一条还在回答中' } };
    }
    if (result.reason === 'no_model') {
      return { status: 503, body: { error: '未配置追问模型，请在 /settings 配置' } };
    }
    throw new ClientError(
      `chart not found: ${input.id}`,
      'GET /api/charts lists available ids',
      404,
    );
  },

  async abort(input) {
    const doc = await loadChart(input.id);
    if (!doc || !isIntradayChart(doc)) {
      throw new ClientError(
        `chart not found: ${input.id}`,
        'GET /api/charts lists available ids',
        404,
      );
    }
    if (!abortChatTurn(input.id)) {
      return { status: 409, body: { error: '当前没有正在生成的回答' } };
    }
    return { status: 202, body: { aborted: true } };
  },

  async suggestions(input) {
    const doc = await loadChart(input.id);
    if (!doc || !isIntradayChart(doc)) {
      throw new ClientError(
        `chart not found: ${input.id}`,
        'GET /api/charts lists available ids',
        404,
      );
    }
    const session = await getSessionByChartId(input.id);
    if (session) return { suggestions: [] };
    return { suggestions: await buildChatSuggestions(input.id, testSuggestionDeps ?? {}) };
  },
};
