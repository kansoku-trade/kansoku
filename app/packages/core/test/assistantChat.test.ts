import type { AgentEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AiAgentFactory } from "../src/ai/agentSession.js";
import {
  abortAssistantChatTurn,
  assistantChatTurnState,
  onAssistantChatEvent,
  runAssistantChatTurn,
} from "../src/ai/assistantChat.js";
import { createAssistantSession, listAssistantMessages, sumAssistantSessionUsage } from "../src/ai/assistantChatStore.js";
import type { ChatEvent } from "../src/ai/chat.js";
import type { AiModel } from "../src/ai/models.js";
import { createDb, type Db } from "../src/db/index.js";

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

function assistant(text: string, usage = ZERO_USAGE): AgentMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "test-model",
    usage,
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "assistant-chat-test-"));
  db = createDb(":memory:");
  write(".claude/skills/trading-discipline/SKILL.md", "---\nname: trading-discipline\ndescription: test\n---\n测试纪律。");
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("assistant chat", () => {
  it("runs a happy-path turn and persists messages", async () => {
    const session = await createAssistantSession({ title: "新对话" }, db);
    const factory: AiAgentFactory = (config) => {
      const state = { messages: [...(config.messages ?? [])] };
      return {
        prompt: async (text) => {
          state.messages.push({ role: "user", content: text, timestamp: Date.now() });
          state.messages.push(assistant("你好，我是助手。"));
        },
        abort: () => undefined,
        state,
      };
    };

    const result = await runAssistantChatTurn(session.id, "你好", {
      model,
      rootDir: root,
      db,
      agentFactory: factory,
      disciplineText: "# trading-discipline\n测试纪律。",
    });
    expect(result.started).toBe(true);
    if (result.started) await result.done;

    const messages = await listAssistantMessages(session.id, db);
    expect(messages.map((row) => row.role)).toEqual(["user", "assistant"]);
  });

  it("rejects when no model is configured", async () => {
    const session = await createAssistantSession({ title: "新对话" }, db);
    const result = await runAssistantChatTurn(session.id, "你好", {
      model: null,
      rootDir: root,
      db,
      disciplineText: "# trading-discipline\n测试纪律。",
    });
    expect(result).toEqual({ started: false, reason: "no_model" });
  });

  it("rejects when the session does not exist", async () => {
    const result = await runAssistantChatTurn("missing-session", "你好", {
      model,
      rootDir: root,
      db,
      disciplineText: "# trading-discipline\n测试纪律。",
    });
    expect(result).toEqual({ started: false, reason: "not_found" });
  });

  it("locks the session while a turn is in flight", async () => {
    const session = await createAssistantSession({ title: "新对话" }, db);
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

    const first = await runAssistantChatTurn(session.id, "第一条", deps);
    expect(first.started).toBe(true);
    await started;
    expect(assistantChatTurnState(session.id).busy).toBe(true);
    expect(await runAssistantChatTurn(session.id, "第二条", deps)).toEqual({ started: false, reason: "busy" });

    release();
    if (first.started) await first.done;
    expect(assistantChatTurnState(session.id)).toEqual({ busy: false, partial: "" });
  });

  it("streams deltas live, broadcasts aborted, and persists the partial through the injected db", async () => {
    const session = await createAssistantSession({ title: "新对话" }, db);
    const events: ChatEvent[] = [];
    const unsub = onAssistantChatEvent(session.id, (event) => events.push(event));

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
              expect(abortAssistantChatTurn(session.id)).toBe(true);
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

    const result = await runAssistantChatTurn(session.id, "讲讲", {
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
    const messages = await listAssistantMessages(session.id, db);
    expect(messages.map((row) => row.role)).toEqual(["user", "assistant"]);
    expect(messages[1].payload).toMatchObject({
      role: "assistant",
      content: [{ type: "text", text: "半截回答" }],
      stopReason: "aborted",
    });
  });

  it("exposes exactly the read-only bash/skill/library tool set", async () => {
    const session = await createAssistantSession({ title: "新对话" }, db);
    let capturedToolNames: string[] = [];
    const factory: AiAgentFactory = (config) => {
      capturedToolNames = config.tools.map((tool) => tool.name);
      const state = { messages: [...(config.messages ?? [])] };
      return {
        prompt: async () => {
          state.messages.push(assistant("好的"));
        },
        abort: () => undefined,
        state,
      };
    };

    const result = await runAssistantChatTurn(session.id, "你好", {
      model,
      rootDir: root,
      db,
      agentFactory: factory,
      disciplineText: "# trading-discipline\n测试纪律。",
    });
    expect(result.started).toBe(true);
    if (result.started) await result.done;

    expect([...capturedToolNames].sort()).toEqual(
      ["bash", "read_file", "read_research_document", "read_skill", "search_research_documents"].sort(),
    );
  });

  it("wires transformContext to inject the skill catalog from the repo's skill index", async () => {
    const session = await createAssistantSession({ title: "新对话" }, db);
    write(".claude/skills/foo/SKILL.md", "---\nname: foo\ndescription: 演示技能\n---\nfoo body");

    let capturedTransform: ((messages: AgentMessage[]) => Promise<AgentMessage[]>) | undefined;
    const factory: AiAgentFactory = (config) => {
      capturedTransform = config.transformContext;
      return {
        prompt: async () => {},
        abort: () => undefined,
        state: { messages: [...(config.messages ?? [])] },
      };
    };

    const result = await runAssistantChatTurn(session.id, "你好", {
      model,
      rootDir: root,
      db,
      agentFactory: factory,
      disciplineText: "# trading-discipline\n测试纪律。",
    });
    expect(result.started).toBe(true);
    if (result.started) await result.done;

    if (!capturedTransform) throw new Error("missing transformContext");
    const viewed = await capturedTransform([{ role: "user", content: "hi", timestamp: 0 }]);
    const text = JSON.stringify(viewed);
    expect(text).toContain("<available_skills>");
    expect(text).toContain("foo");
  });

  it("includes discipline text and the @path instruction in the system prompt", async () => {
    const session = await createAssistantSession({ title: "新对话" }, db);
    let capturedSystemPrompt = "";
    const factory: AiAgentFactory = (config) => {
      capturedSystemPrompt = config.systemPrompt ?? "";
      const state = { messages: [...(config.messages ?? [])] };
      return {
        prompt: async () => {
          state.messages.push(assistant("好的"));
        },
        abort: () => undefined,
        state,
      };
    };

    const result = await runAssistantChatTurn(session.id, "你好", {
      model,
      rootDir: root,
      db,
      agentFactory: factory,
      disciplineText: "# trading-discipline\n测试纪律标记。",
    });
    expect(result.started).toBe(true);
    if (result.started) await result.done;

    expect(capturedSystemPrompt).toContain("测试纪律标记。");
    expect(capturedSystemPrompt).toContain("@路径");
  });

  it("fails closed when the shared discipline text cannot be loaded", async () => {
    const emptyRoot = mkdtempSync(join(tmpdir(), "assistant-chat-nodiscipline-"));
    const session = await createAssistantSession({ title: "新对话" }, db);
    const events: ChatEvent[] = [];
    const unsub = onAssistantChatEvent(session.id, (event) => events.push(event));

    const result = await runAssistantChatTurn(session.id, "你好", {
      model,
      rootDir: emptyRoot,
      db,
    });
    expect(result.started).toBe(true);
    if (result.started) await result.done;
    unsub();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event: "error" });
    expect((events[0] as { message: string }).message).toContain("SKILL.md 读不到");
    rmSync(emptyRoot, { recursive: true, force: true });
  });

  it("sums per-session usage across persisted assistant messages", async () => {
    const session = await createAssistantSession({ title: "用量会话" }, db);
    const usageA = { ...ZERO_USAGE, totalTokens: 100, cost: { ...ZERO_USAGE.cost, total: 0.5 } };
    const usageB = { ...ZERO_USAGE, totalTokens: 250, cost: { ...ZERO_USAGE.cost, total: 1.25 } };
    const factory: AiAgentFactory = (config) => {
      const state = { messages: [...(config.messages ?? [])] };
      return {
        prompt: async (text) => {
          state.messages.push({ role: "user", content: text, timestamp: Date.now() });
          state.messages.push(assistant("第一次回答", usageA));
        },
        abort: () => undefined,
        state,
      };
    };
    const deps = { model, rootDir: root, db, agentFactory: factory, disciplineText: "# trading-discipline\n测试纪律。" };

    const first = await runAssistantChatTurn(session.id, "第一问", deps);
    expect(first.started).toBe(true);
    if (first.started) await first.done;

    const factory2: AiAgentFactory = (config) => {
      const state = { messages: [...(config.messages ?? [])] };
      return {
        prompt: async (text) => {
          state.messages.push({ role: "user", content: text, timestamp: Date.now() });
          state.messages.push(assistant("第二次回答", usageB));
        },
        abort: () => undefined,
        state,
      };
    };
    const second = await runAssistantChatTurn(session.id, "第二问", { ...deps, agentFactory: factory2 });
    expect(second.started).toBe(true);
    if (second.started) await second.done;

    const total = await sumAssistantSessionUsage(session.id, db);
    expect(total).toEqual({ totalTokens: 350, costTotal: 1.75, calls: 2 });
  });

  it("sumAssistantSessionUsage ignores messages without usage fields", async () => {
    const session = await createAssistantSession({ title: "无用量会话" }, db);
    const factory: AiAgentFactory = (config) => {
      const state = { messages: [...(config.messages ?? [])] };
      return {
        prompt: async (text) => {
          state.messages.push({ role: "user", content: text, timestamp: Date.now() });
          state.messages.push({ role: "assistant", content: [{ type: "text", text: "无用量数据" }], timestamp: Date.now() } as AgentMessage);
        },
        abort: () => undefined,
        state,
      };
    };
    const result = await runAssistantChatTurn(session.id, "问一下", {
      model,
      rootDir: root,
      db,
      agentFactory: factory,
      disciplineText: "# trading-discipline\n测试纪律。",
    });
    expect(result.started).toBe(true);
    if (result.started) await result.done;

    const total = await sumAssistantSessionUsage(session.id, db);
    expect(total).toEqual({ totalTokens: 0, costTotal: 0, calls: 0 });
  });
});
