import type { AgentEvent } from "@earendil-works/pi-agent-core";
import type { AiAgentFactory } from "../src/ai/agentSession.js";
import type { AiModel } from "../src/ai/models.js";
import { runAssistantChatTurn } from "../src/ai/assistantChat.js";
import { createAssistantSession } from "../src/ai/assistantChatStore.js";
import { createDb, type Db } from "../src/db/index.js";
import type { Connection } from "../src/realtime/connection.js";
import { describe, expect, it } from "vitest";
import { handleConnection, parseWsMessage } from "../src/realtime/channelProtocol.js";

const model = { provider: "anthropic", id: "test-model" } as unknown as AiModel;

function makeConnection(): Connection & { sent: string[]; emitMessage: (raw: string) => void; close: () => void } {
  const sent: string[] = [];
  let onMessage: ((raw: string) => void) | undefined;
  let onClose: (() => void) | undefined;
  return {
    sent,
    send: (text) => sent.push(text),
    onMessage: (cb) => {
      onMessage = cb;
    },
    onClose: (cb) => {
      onClose = cb;
    },
    emitMessage: (raw) => onMessage?.(raw),
    close: () => onClose?.(),
  };
}

async function waitFor(check: () => boolean): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("timed out waiting for condition");
}

describe("parseWsMessage preview kind", () => {
  it("parses a valid preview subscription", () => {
    expect(parseWsMessage({ op: "sub", key: "k1", kind: "preview", symbol: "QQQ.US" })).toEqual({
      op: "sub",
      key: "k1",
      kind: "preview",
      symbol: "QQQ.US",
    });
  });

  it("rejects a missing symbol", () => {
    expect(parseWsMessage({ op: "sub", key: "k1", kind: "preview" })).toBeNull();
  });

  it("rejects an empty symbol", () => {
    expect(parseWsMessage({ op: "sub", key: "k1", kind: "preview", symbol: "" })).toBeNull();
  });
});

describe("parseWsMessage assistant-chat kind", () => {
  it("parses a valid assistant-chat subscription", () => {
    expect(parseWsMessage({ op: "sub", key: "k1", kind: "assistant-chat", id: "s1" })).toEqual({
      op: "sub",
      key: "k1",
      kind: "assistant-chat",
      id: "s1",
    });
  });

  it("rejects a missing id", () => {
    expect(parseWsMessage({ op: "sub", key: "k1", kind: "assistant-chat" })).toBeNull();
  });

  it("rejects an empty id", () => {
    expect(parseWsMessage({ op: "sub", key: "k1", kind: "assistant-chat", id: "" })).toBeNull();
  });
});

describe("assistant-chat channel", () => {
  it("pushes init, forwards live events, and stops after unsubscribe", async () => {
    const db: Db = createDb(":memory:");
    const session = await createAssistantSession({ title: "会话" }, db);

    let releasePrompt: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releasePrompt = resolve;
    });
    let listener: ((event: AgentEvent) => void) | undefined;
    const factory: AiAgentFactory = (config) => ({
      prompt: async () => {
        listener?.({
          type: "message_start",
          message: { role: "assistant", content: [{ type: "text", text: "" }], timestamp: Date.now() } as never,
        });
        const message = { role: "assistant", content: [{ type: "text", text: "分析中" }], timestamp: Date.now() };
        listener?.({
          type: "message_update",
          message: message as never,
          assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "分析中", partial: message as never },
        });
        await gate;
      },
      abort: () => undefined,
      subscribe: (l) => {
        listener = l;
        return () => {
          listener = undefined;
        };
      },
      state: { messages: [...(config.messages ?? [])] },
    });

    void runAssistantChatTurn(session.id, "你好", {
      model,
      db,
      rootDir: process.cwd(),
      agentFactory: factory,
      disciplineText: "# trading-discipline\n测试纪律。",
    });
    await waitFor(() => listener !== undefined);

    const conn = makeConnection();
    handleConnection(conn);
    conn.emitMessage(JSON.stringify({ op: "sub", key: "assistant1", kind: "assistant-chat", id: session.id }));
    await waitFor(() => conn.sent.some((raw) => raw.includes('"type":"init"')));
    expect(JSON.parse(conn.sent.find((raw) => raw.includes('"type":"init"'))!)).toEqual({
      key: "assistant1",
      payload: { type: "init", busy: true, partial: "分析中" },
    });

    conn.sent.length = 0;
    const moreMessage = { role: "assistant", content: [{ type: "text", text: "分析中更多" }], timestamp: Date.now() };
    listener?.({
      type: "message_update",
      message: moreMessage as never,
      assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "更多", partial: moreMessage as never },
    });
    await waitFor(() => conn.sent.some((raw) => raw.includes('"type":"event"')));
    expect(JSON.parse(conn.sent.find((raw) => raw.includes('"type":"event"'))!)).toEqual({
      key: "assistant1",
      payload: { type: "event", event: { event: "delta", text: "更多" } },
    });

    conn.emitMessage(JSON.stringify({ op: "unsub", key: "assistant1" }));
    conn.sent.length = 0;

    const evenMoreMessage = { role: "assistant", content: [{ type: "text", text: "分析中更多结论" }], timestamp: Date.now() };
    listener?.({
      type: "message_update",
      message: evenMoreMessage as never,
      assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "结论", partial: evenMoreMessage as never },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(conn.sent).toHaveLength(0);

    releasePrompt();
  });
});

describe("parseWsMessage annotations kind", () => {
  it("parses a valid annotations subscription", () => {
    expect(parseWsMessage({ op: "sub", key: "k1", kind: "annotations", symbol: "NVDA.US" })).toEqual({
      op: "sub",
      key: "k1",
      kind: "annotations",
      symbol: "NVDA.US",
    });
  });

  it("rejects a missing symbol", () => {
    expect(parseWsMessage({ op: "sub", key: "k1", kind: "annotations" })).toBeNull();
  });

  it("rejects an empty symbol", () => {
    expect(parseWsMessage({ op: "sub", key: "k1", kind: "annotations", symbol: "" })).toBeNull();
  });
});
