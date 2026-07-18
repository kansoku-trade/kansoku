import {
  type AssistantChatDeps,
  abortAssistantChatTurn,
  assistantChatTurnState,
  runAssistantChatTurn,
} from "../../ai/assistantChat.js";
import {
  createAssistantSession,
  deleteAssistantSession,
  getAssistantSession,
  listAssistantMessages,
  listAssistantSessions,
  sumAssistantSessionUsage,
} from "../../ai/assistantChatStore.js";
import { toDisplayMessages } from "../../ai/chat.js";
import { aiConfig } from "../../ai/models.js";
import type { AssistantApi } from "../../contract/assistant.js";
import { ClientError } from "../../errors.js";

const MAX_TEXT_LENGTH = 4_000;
const DEFAULT_TITLE = "新对话";

let testDeps: AssistantChatDeps | null = null;

export function setAssistantChatDepsForTests(deps: AssistantChatDeps | null): void {
  testDeps = deps;
}

function buildDeps(): AssistantChatDeps {
  return testDeps ?? { model: aiConfig().chatModel };
}

async function requireSession(id: string, db: AssistantChatDeps["db"]) {
  const session = await getAssistantSession(id, db);
  if (!session) throw new ClientError("assistant session not found", undefined, 404);
  return session;
}

export const assistantChatService: AssistantApi = {
  async listSessions() {
    const sessions = await listAssistantSessions(testDeps?.db);
    return { sessions };
  },

  async createSession(input) {
    const title = input.title?.trim() || DEFAULT_TITLE;
    const session = await createAssistantSession({ title }, testDeps?.db);
    return { session };
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
    return { session, messages, busy, partial, usage };
  },

  async postMessage(input) {
    if (!input.text.trim() || input.text.length > MAX_TEXT_LENGTH) {
      throw new ClientError("`text` must be a non-empty string of at most 4000 characters", '{"text":"..."}');
    }
    const result = await runAssistantChatTurn(input.id, input.text, buildDeps());
    if (result.started) {
      result.done.catch((error) => console.error("assistant chat: turn failed", error));
      return { status: 202, body: { accepted: true } };
    }
    if (result.reason === "busy") return { status: 409, body: { error: "上一条还在回答中" } };
    if (result.reason === "not_found") return { status: 404, body: { error: "会话不存在" } };
    return { status: 503, body: { error: "未配置追问模型，请在 /settings 配置" } };
  },

  async abortChat(input) {
    return { ok: abortAssistantChatTurn(input.id) };
  },
};
