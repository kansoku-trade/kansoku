import { beforeEach, describe, expect, it } from "vitest";
import type { AiAgentFactory } from "../../packages/core/src/ai/agentSession.js";
import type { AssistantChatDeps } from "../../packages/core/src/ai/assistantChat.js";
import type { AiModel } from "../../packages/core/src/ai/models.js";
import { createDb, type Db } from "../../packages/core/src/db/index.js";
import { setAssistantChatDepsForTests } from "../../packages/core/src/modules/assistant/assistantChat.service.js";
import { tsukiRequest } from "./helpers.js";

const fakeModel = { provider: "anthropic", id: "test-model" } as unknown as AiModel;
const DISCIPLINE = "# trading-discipline\n测试纪律。";

let db: Db;

function idleFactory(): AiAgentFactory {
  return () => ({ prompt: async () => {}, abort: () => {}, state: { messages: [] } });
}

function baseDeps(overrides: Partial<AssistantChatDeps> = {}): AssistantChatDeps {
  return {
    model: fakeModel,
    db,
    disciplineText: DISCIPLINE,
    agentFactory: idleFactory(),
    ...overrides,
  };
}

beforeEach(() => {
  db = createDb(":memory:");
  setAssistantChatDepsForTests(baseDeps());
});

async function createSession(title?: string): Promise<{ id: string }> {
  const res = await tsukiRequest("/api/assistant/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(title ? { title } : {}),
  });
  const body = await res.json();
  return body.session;
}

describe("assistant routes", () => {
  it("runs the full session + chat lifecycle", async () => {
    const created = await (async () => {
      const res = await tsukiRequest("/api/assistant/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "研究会话" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.session.title).toBe("研究会话");
      return body.session;
    })();

    const listRes = await tsukiRequest("/api/assistant/sessions");
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.sessions.some((s: { id: string }) => s.id === created.id)).toBe(true);

    const emptyChatRes = await tsukiRequest(`/api/assistant/sessions/${created.id}/chat`);
    expect(emptyChatRes.status).toBe(200);
    const emptyChatBody = await emptyChatRes.json();
    expect(emptyChatBody.session.id).toBe(created.id);
    expect(emptyChatBody.messages).toEqual([]);
    expect(emptyChatBody.busy).toBe(false);
    expect(emptyChatBody.usage).toEqual({ totalTokens: 0, costTotal: 0, calls: 0 });

    let releasePrompt: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releasePrompt = resolve;
    });
    let signalStarted: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });

    setAssistantChatDepsForTests(
      baseDeps({
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

    const firstPost = tsukiRequest(`/api/assistant/sessions/${created.id}/chat/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "你好" }),
    });
    await started;

    const busyRes = await tsukiRequest(`/api/assistant/sessions/${created.id}/chat/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "第二条" }),
    });
    expect(busyRes.status).toBe(409);
    expect(await busyRes.json()).toEqual({ error: "上一条还在回答中" });

    const abortRes = await tsukiRequest(`/api/assistant/sessions/${created.id}/chat/abort`, {
      method: "POST",
    });
    expect(abortRes.status).toBe(200);
    expect(await abortRes.json()).toEqual({ ok: true });

    releasePrompt();
    const firstRes = await firstPost;
    expect(firstRes.status).toBe(202);
    expect(await firstRes.json()).toEqual({ accepted: true });

    const deleteRes = await tsukiRequest(`/api/assistant/sessions/${created.id}`, { method: "DELETE" });
    expect(deleteRes.status).toBe(200);
    expect(await deleteRes.json()).toEqual({ ok: true });

    const notFoundChat = await tsukiRequest(`/api/assistant/sessions/${created.id}/chat`);
    expect(notFoundChat.status).toBe(404);
  });

  it("returns 503 when no chat model is configured", async () => {
    const session = await createSession();
    setAssistantChatDepsForTests(baseDeps({ model: null }));

    const res = await tsukiRequest(`/api/assistant/sessions/${session.id}/chat/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "你好" }),
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "未配置追问模型，请在 /settings 配置" });
  });

  it("returns 404 when posting to an unknown session id", async () => {
    const res = await tsukiRequest("/api/assistant/sessions/does-not-exist/chat/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "你好" }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "会话不存在" });
  });

  it("rejects empty, whitespace-only, or overly long text with 400", async () => {
    const session = await createSession();
    const empty = await tsukiRequest(`/api/assistant/sessions/${session.id}/chat/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "" }),
    });
    expect(empty.status).toBe(400);

    const tooLong = await tsukiRequest(`/api/assistant/sessions/${session.id}/chat/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "a".repeat(4001) }),
    });
    expect(tooLong.status).toBe(400);
  });

  it("404s when deleting an unknown session id", async () => {
    const res = await tsukiRequest("/api/assistant/sessions/does-not-exist", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  it("404s when getting chat state for an unknown session id", async () => {
    const res = await tsukiRequest("/api/assistant/sessions/does-not-exist/chat");
    expect(res.status).toBe(404);
  });
});
