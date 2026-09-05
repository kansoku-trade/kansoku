import {
  type AssistantChatDeps,
  abortAssistantChatTurn,
  assistantChatTurnState,
  runAssistantChatTurn,
} from './assistantChat.js';
import {
  type AssistantSession,
  createAssistantSession,
  deleteAssistantSession,
  digestAssistantSessions,
  getAssistantSession,
  listAssistantMessages,
  listAssistantSessions,
  sumAssistantSessionUsage,
  updateAssistantSessionTitle,
} from './assistantChatStore.js';
import {
  assistantMessageSchema,
  assistantOptionalTitleSchema,
  assistantTitleSchema,
  parseClientInput,
} from './assistantInput.js';
import { DEFAULT_ASSISTANT_TITLE } from './sessionTitle.js';
import { toDisplayMessages } from '../chat/chat.js';
import { aiConfig } from '../runtime/models.js';
import type { AssistantApi, AssistantSessionMeta } from '../../contract/assistant.js';
import { ClientError } from '../../platform/errors.js';

let testDeps: AssistantChatDeps | null = null;

export function setAssistantChatDepsForTests(deps: AssistantChatDeps | null): void {
  testDeps = deps;
}

function buildDeps(): AssistantChatDeps {
  if (testDeps) return testDeps;
  const config = aiConfig();
  return { model: config.chatModel, titleModel: config.titleModel };
}

async function requireSession(id: string, db: AssistantChatDeps['db']) {
  const session = await getAssistantSession(id, db);
  if (!session) throw new ClientError('assistant session not found', undefined, 404);
  return session;
}

async function toSessionMetas(sessions: AssistantSession[]): Promise<AssistantSessionMeta[]> {
  const digests = await digestAssistantSessions(
    sessions.map((session) => session.id),
    testDeps?.db,
  );
  return sessions.map((session) => {
    const digest = digests.get(session.id);
    return {
      ...session,
      busy: assistantChatTurnState(session.id).busy,
      messageCount: digest?.messageCount ?? 0,
      preview: digest?.preview ?? null,
    };
  });
}

async function toSessionMeta(session: AssistantSession): Promise<AssistantSessionMeta> {
  const [meta] = await toSessionMetas([session]);
  return meta;
}

export const assistantChatService: AssistantApi = {
  async listSessions() {
    const sessions = await toSessionMetas(await listAssistantSessions(testDeps?.db));
    return { sessions };
  },

  async createSession(input) {
    const rawTitle = parseClientInput(assistantOptionalTitleSchema, input.title);
    const title = rawTitle?.trim() || DEFAULT_ASSISTANT_TITLE;
    const session = await createAssistantSession({ title }, testDeps?.db);
    return { session: await toSessionMeta(session) };
  },

  async updateSession(input) {
    const title = parseClientInput(assistantTitleSchema, input.title, '{"title":"..."}');
    await requireSession(input.id, testDeps?.db);
    const session = await updateAssistantSessionTitle(input.id, title, testDeps?.db);
    if (!session) throw new ClientError('assistant session not found', undefined, 404);
    return { session: await toSessionMeta(session) };
  },

  async deleteSession(input) {
    await requireSession(input.id, testDeps?.db);
    abortAssistantChatTurn(input.id);
    await deleteAssistantSession(input.id, testDeps?.db);
    return { ok: true };
  },

  async getChat(input) {
    const session = await requireSession(input.id, testDeps?.db);
    const messages = toDisplayMessages(await listAssistantMessages(input.id, testDeps?.db));
    const { busy, partial } = assistantChatTurnState(input.id);
    const usage = await sumAssistantSessionUsage(input.id, testDeps?.db);
    return { session: await toSessionMeta(session), messages, busy, partial, usage };
  },

  async postMessage(input) {
    const text = parseClientInput(assistantMessageSchema, input.text, '{"text":"..."}');
    const result = await runAssistantChatTurn(input.id, text, buildDeps(), {
      replaceLast: input.replaceLast === true,
    });
    if (result.started) {
      result.done.catch((error) => console.error('assistant chat: turn failed', error));
      return { status: 202, body: { accepted: true } };
    }
    if (result.reason === 'busy') return { status: 409, body: { error: '上一条还在回答中' } };
    if (result.reason === 'not_found') return { status: 404, body: { error: '会话不存在' } };
    return { status: 503, body: { error: '未配置追问模型，请在 /settings 配置' } };
  },

  async abortChat(input) {
    return { ok: abortAssistantChatTurn(input.id) };
  },
};
