import type { AgentEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AiAgentFactory } from "../src/ai/agentSession.js";
import type { AiModel } from "../src/ai/models.js";
import { getResearchSessionByPath, listResearchMessages } from "../src/ai/researchChatStore.js";
import type { ChatEvent } from "../src/ai/chat.js";
import {
  abortResearchChatTurn,
  onResearchChatEvent,
  researchChatTurnState,
  runResearchChatTurn,
} from "../src/ai/researchChat.js";
import { createDb, type Db } from "../src/db/index.js";
import { listResearchEditProposals } from "../src/modules/research/researchEdit.service.js";

const model = { provider: "anthropic", id: "test-model" } as unknown as AiModel;
const ZERO_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};
let root: string;
let db: Db;

function write(path: string, content: string): void {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
}

function assistant(text: string): AgentMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "test-model",
    usage: ZERO_USAGE,
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "research-chat-test-"));
  db = createDb(":memory:");
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("research chat", () => {
  it("creates a reviewable edit instead of writing the document directly", async () => {
    write("stocks/MU.md", "# MU\n\n旧判断。\n");
    const factory: AiAgentFactory = (config) => {
      const state = { messages: [...(config.messages ?? [])] };
      return {
        prompt: async (text) => {
          state.messages.push({ role: "user", content: text, timestamp: Date.now() });
          const tool = config.tools.find((item) => item.name === "propose_current_document_edit");
          if (!tool) throw new Error("missing proposal tool");
          await tool.execute("proposal-1", {
            summary: "更新核心判断",
            operations: [{ type: "replace", oldText: "旧判断。", newText: "新判断。" }],
          });
          state.messages.push(assistant("修改提案已经生成，等待审阅。"));
        },
        abort: () => undefined,
        state,
      };
    };

    const result = await runResearchChatTurn("stocks/MU.md", "把旧判断更新掉", {
      model,
      rootDir: root,
      db,
      agentFactory: factory,
      disciplineText: "# trading-discipline\n测试纪律。",
      buildPack: async () => {
        throw new Error("market tool should not run");
      },
      fetchNews: async () => [],
    });
    expect(result.started).toBe(true);
    if (result.started) await result.done;

    const edits = await listResearchEditProposals("stocks/MU.md", { db });
    expect(edits).toHaveLength(1);
    expect(edits[0]).toMatchObject({ status: "pending", summary: "更新核心判断" });
    expect(readFileSync(join(root, "stocks/MU.md"), "utf8")).toContain("旧判断。");
    const session = await getResearchSessionByPath("stocks/MU.md", db);
    expect(session).not.toBeNull();
    expect(edits[0].sessionId).toBe(session!.id);
    const messages = await listResearchMessages(session!.id, db);
    expect(messages.map((row) => row.role)).toEqual(["user", "assistant"]);
  });

  it("refuses to start without a configured model", async () => {
    write("stocks/MU.md", "# MU\n");
    const result = await runResearchChatTurn("stocks/MU.md", "你好", {
      model: null,
      rootDir: root,
      db,
      disciplineText: "# trading-discipline\n测试纪律。",
    });
    expect(result).toEqual({ started: false, reason: "no_model" });
  });

  it("locks the path while a turn is in flight", async () => {
    write("stocks/MU.md", "# MU\n");
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let signalStarted: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    const factory: AiAgentFactory = (config) => ({
      prompt: async () => {
        signalStarted();
        await gate;
      },
      abort: () => undefined,
      state: { messages: [...(config.messages ?? [])] },
    });
    const deps = { model, rootDir: root, db, agentFactory: factory, disciplineText: "# trading-discipline\n测试纪律。" };

    const first = await runResearchChatTurn("stocks/MU.md", "第一条", deps);
    expect(first.started).toBe(true);
    await started;
    expect(researchChatTurnState("stocks/MU.md").busy).toBe(true);
    expect(await runResearchChatTurn("stocks/MU.md", "第二条", deps)).toEqual({ started: false, reason: "busy" });

    release();
    if (first.started) await first.done;
    expect(researchChatTurnState("stocks/MU.md")).toEqual({ busy: false, partial: "" });
  });

  it("streams deltas live, broadcasts aborted, and persists the partial through the injected db", async () => {
    write("stocks/MU.md", "# MU\n");
    const events: ChatEvent[] = [];
    const unsub = onResearchChatEvent("stocks/MU.md", (event) => events.push(event));

    let rejectPrompt: ((err: Error) => void) | undefined;
    const factory: AiAgentFactory = (config) => {
      let listener: ((event: AgentEvent) => void) | undefined;
      return {
        prompt: () =>
          new Promise((_resolve, reject) => {
            rejectPrompt = reject;
            listener?.({ type: "message_start", message: assistant("") });
            const message = assistant("半截回答");
            listener?.({
              type: "message_update",
              message,
              assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "半截回答", partial: message as never },
            });
            queueMicrotask(() => {
              expect(abortResearchChatTurn("stocks/MU.md")).toBe(true);
            });
          }),
        abort: () => rejectPrompt?.(new Error("aborted")),
        subscribe: (l) => {
          listener = l;
          return () => {
            listener = undefined;
          };
        },
        state: { messages: [...(config.messages ?? [])] },
      };
    };

    const result = await runResearchChatTurn("stocks/MU.md", "讲讲", {
      model,
      rootDir: root,
      db,
      agentFactory: factory,
      disciplineText: "# trading-discipline\n测试纪律。",
    });
    expect(result.started).toBe(true);
    if (result.started) await result.done;
    unsub();

    expect(events).toEqual([{ event: "delta", text: "半截回答" }, { event: "aborted" }]);
    const session = await getResearchSessionByPath("stocks/MU.md", db);
    expect(session).not.toBeNull();
    const messages = await listResearchMessages(session!.id, db);
    expect(messages.map((row) => row.role)).toEqual(["user", "assistant"]);
    expect(messages[1].payload).toMatchObject({
      role: "assistant",
      content: [{ type: "text", text: "半截回答" }],
      stopReason: "aborted",
    });
  });
});
