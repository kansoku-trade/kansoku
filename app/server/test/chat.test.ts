import type { AgentEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import { describe, expect, it, vi } from "vitest";
import type { ChartDoc, CockpitComment } from "../../shared/types.js";
import type { AiAgentFactory } from "../src/ai/agentSession.js";
import type { ChatMessageRow } from "../src/ai/chatStore.js";
import type { AiModel } from "../src/ai/models.js";

const ctx = vi.hoisted(() => {
  const base = process.env.TMPDIR ?? "/tmp/";
  const sep = base.endsWith("/") ? "" : "/";
  const dir = `${base}${sep}chat-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { dir };
});

vi.mock("../src/env.js", () => ({ CHART_DATA_DIR: ctx.dir }));

const { runChatTurn, onChatEvent, chatTurnState, toDisplayMessages, buildChatSystemPrompt } = await import(
  "../src/ai/chat.js"
);
const { getSessionByChartId, listMessages } = await import("../src/ai/chatStore.js");

type ChatEvent = Parameters<Parameters<typeof onChatEvent>[1]>[0];
type ChatDeps = Parameters<typeof runChatTurn>[2];

const fakeModel = { provider: "anthropic", id: "claude-haiku-4-5" } as unknown as AiModel;

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
    role: "assistant",
    content: [{ type: "text", text }],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "test-model",
    usage: ZERO_USAGE,
    stopReason: "stop",
    timestamp: 0,
  };
}

function messageStartEvent(): AgentEvent {
  return { type: "message_start", message: assistantMessage("") };
}

function messageUpdateEvent(fullText: string): AgentEvent {
  const message = assistantMessage(fullText);
  return {
    type: "message_update",
    message,
    assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: fullText, partial: message as never },
  };
}

function fakeDoc(overrides: Partial<ChartDoc> = {}): ChartDoc {
  return {
    id: "chart-1",
    schema_version: 2,
    type: "intraday",
    title: "MU 短线",
    symbol: "MU.US",
    created_at: "2026-07-05T14:00:00.000Z",
    updated_at: "2026-07-05T14:00:00.000Z",
    input: {},
    built: { kind: "intraday" } as unknown as ChartDoc["built"],
    ...overrides,
  };
}

function baseDeps(overrides: Partial<ChatDeps> = {}): ChatDeps {
  return {
    model: fakeModel,
    loadChart: async () => fakeDoc(),
    listComments: async () => [],
    buildPack: async () => {
      throw new Error("buildPack should not be invoked unless the tool is executed");
    },
    fetchKline: async () => [],
    fetchNews: async () => [],
    now: () => 0,
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

async function expectSessionRows(chartId: string): Promise<ChatMessageRow[]> {
  const session = await getSessionByChartId(chartId);
  if (!session) throw new Error(`no session for ${chartId}`);
  return listMessages(session.id);
}

describe("runChatTurn gating", () => {
  it("releases the lock on chart_not_found / not_intraday / no_model, each followed by a valid start", async () => {
    const chartId = "gate-1";

    expect(await runChatTurn(chartId, "hi", baseDeps({ loadChart: async () => null }))).toEqual({
      started: false,
      reason: "chart_not_found",
    });

    expect(
      await runChatTurn(
        chartId,
        "hi",
        baseDeps({ loadChart: async () => fakeDoc({ built: { kind: "simple" } as unknown as ChartDoc["built"] }) }),
      ),
    ).toEqual({ started: false, reason: "not_intraday" });

    expect(await runChatTurn(chartId, "hi", baseDeps({ model: null }))).toEqual({
      started: false,
      reason: "no_model",
    });

    const ok = await runChatTurn(chartId, "hi", baseDeps({ agentFactory: noopFactory() }));
    expect(ok.started).toBe(true);
    if (ok.started) await ok.done;
  });

  it("rejects a second call while one is in flight, then allows a new turn once it settles", async () => {
    const chartId = "gate-2";
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

    const first = await runChatTurn(chartId, "first", baseDeps({ agentFactory: factory }));
    expect(first.started).toBe(true);

    expect(await runChatTurn(chartId, "second", baseDeps({ agentFactory: factory }))).toEqual({
      started: false,
      reason: "busy",
    });

    await promptCalled;
    resolvePrompt?.();
    if (first.started) await first.done;

    const third = await runChatTurn(chartId, "third", baseDeps({ agentFactory: noopFactory() }));
    expect(third.started).toBe(true);
    if (third.started) await third.done;
  });

  it("emits a timeout error event and releases the lock", async () => {
    const chartId = "gate-3";
    const events: ChatEvent[] = [];
    const unsub = onChatEvent(chartId, (e) => events.push(e));

    const hangFactory: AiAgentFactory = (config) => ({
      prompt: () => new Promise<void>(() => {}),
      abort: () => {},
      state: { messages: [...(config.messages ?? [])] },
    });

    const result = await runChatTurn(chartId, "hi", baseDeps({ agentFactory: hangFactory, timeoutMs: 10 }));
    expect(result.started).toBe(true);
    if (result.started) await result.done;
    unsub();

    expect(events).toEqual([{ event: "error", message: "回答超时（10ms）" }]);

    const again = await runChatTurn(chartId, "hi2", baseDeps({ agentFactory: noopFactory() }));
    expect(again.started).toBe(true);
    if (again.started) await again.done;
  });
});

describe("runChatTurn persistence", () => {
  it("persists the user row before running the agent, even when the factory's prompt rejects", async () => {
    const chartId = "persist-1";
    const events: ChatEvent[] = [];
    const unsub = onChatEvent(chartId, (e) => events.push(e));

    const rejectFactory: AiAgentFactory = (config) => ({
      prompt: async () => {
        throw new Error("boom");
      },
      abort: () => {},
      state: { messages: [...(config.messages ?? [])] },
    });

    const result = await runChatTurn(chartId, "会失败的问题", baseDeps({ agentFactory: rejectFactory }));
    expect(result.started).toBe(true);
    if (result.started) await result.done;
    unsub();

    expect(events).toEqual([{ event: "error", message: "boom" }]);

    const rows = await expectSessionRows(chartId);
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("user");
    expect((rows[0].payload as { content: string }).content).toBe("会失败的问题");

    const again = await runChatTurn(chartId, "重试", baseDeps({ agentFactory: noopFactory() }));
    expect(again.started).toBe(true);
    if (again.started) await again.done;
  });

  it("persists exactly the assistant/tool increment beyond the agent's own user-message copy", async () => {
    const chartId = "persist-2";
    const toolResult: AgentMessage = {
      role: "toolResult",
      toolCallId: "c1",
      toolName: "fetch_news",
      content: [{ type: "text", text: "news" }],
      isError: false,
      timestamp: 0,
    };
    const reply = assistantMessage("答案");

    const factory: AiAgentFactory = (config) => ({
      prompt: async () => {},
      abort: () => {},
      state: {
        messages: [...(config.messages ?? []), { role: "user", content: "问题", timestamp: 0 }, reply, toolResult],
      },
    });

    const result = await runChatTurn(chartId, "问题", baseDeps({ agentFactory: factory }));
    expect(result.started).toBe(true);
    if (result.started) await result.done;

    const rows = await expectSessionRows(chartId);
    expect(rows.map((r) => r.role)).toEqual(["user", "assistant", "toolResult"]);
    expect(rows[1].payload).toEqual(reply);
    expect(rows[2].payload).toEqual(toolResult);
  });

  it("replays prior session history excluding the newly-persisted user row, and forwards the prompt text", async () => {
    const chartId = "persist-3";
    const capturedConfigs: Parameters<AiAgentFactory>[0][] = [];
    const promptTexts: string[] = [];

    function factory(reply: AgentMessage[]): AiAgentFactory {
      return (config) => {
        capturedConfigs.push(config);
        return {
          prompt: async (text: string) => {
            promptTexts.push(text);
          },
          abort: () => {},
          state: {
            messages: [
              ...(config.messages ?? []),
              { role: "user", content: "own-copy", timestamp: 0 },
              ...reply,
            ],
          },
        };
      };
    }

    const turn1 = await runChatTurn(
      chartId,
      "第一问",
      baseDeps({ agentFactory: factory([assistantMessage("答一")]) }),
    );
    expect(turn1.started).toBe(true);
    if (turn1.started) await turn1.done;

    const turn2 = await runChatTurn(chartId, "第二问", baseDeps({ agentFactory: factory([]) }));
    expect(turn2.started).toBe(true);
    if (turn2.started) await turn2.done;

    expect(promptTexts).toEqual(["第一问", "第二问"]);
    expect(capturedConfigs[1].messages).toEqual([
      { role: "user", content: "第一问", timestamp: 0 },
      assistantMessage("答一"),
    ]);
  });
});

describe("runChatTurn event translation", () => {
  it("translates message_update deltas and tool_execution_start/end, tracking the partial buffer", async () => {
    const chartId = "translate-1";
    const events: ChatEvent[] = [];
    const unsub = onChatEvent(chartId, (e) => events.push(e));
    let observedPartial = "";

    const factory: AiAgentFactory = (config) => {
      let listener: ((event: AgentEvent) => void) | undefined;
      return {
        prompt: async () => {
          listener?.(messageStartEvent());
          listener?.(messageUpdateEvent("Hi"));
          listener?.(messageUpdateEvent("Hi there"));
          observedPartial = chatTurnState(chartId).partial;
          listener?.({ type: "tool_execution_start", toolCallId: "c1", toolName: "fetch_news", args: {} });
          listener?.({ type: "tool_execution_end", toolCallId: "c1", toolName: "fetch_news", result: {}, isError: false });
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

    const result = await runChatTurn(chartId, "问", baseDeps({ agentFactory: factory }));
    expect(result.started).toBe(true);
    if (result.started) await result.done;
    unsub();

    expect(events).toEqual([
      { event: "delta", text: "Hi" },
      { event: "delta", text: " there" },
      { event: "tool", label: "Fetch News", status: "start" },
      { event: "tool", label: "Fetch News", status: "end" },
      { event: "done" },
    ]);
    expect(observedPartial).toBe("Hi there");
  });
});

describe("chatTurnState", () => {
  it("reports busy+partial while a turn is in flight, and resets after it settles", async () => {
    const chartId = "state-1";
    let resolvePrompt: (() => void) | undefined;
    let notifyDispatched: (() => void) | undefined;
    const dispatched = new Promise<void>((resolve) => {
      notifyDispatched = resolve;
    });

    const factory: AiAgentFactory = (config) => {
      let listener: ((event: AgentEvent) => void) | undefined;
      return {
        prompt: () =>
          new Promise<void>((resolve) => {
            listener?.(messageStartEvent());
            listener?.(messageUpdateEvent("部分"));
            resolvePrompt = resolve;
            notifyDispatched?.();
          }),
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

    expect(chatTurnState(chartId)).toEqual({ busy: false, partial: "" });

    const result = await runChatTurn(chartId, "问题", baseDeps({ agentFactory: factory }));
    expect(result.started).toBe(true);

    await dispatched;
    expect(chatTurnState(chartId)).toEqual({ busy: true, partial: "部分" });

    if (result.started) {
      resolvePrompt?.();
      await result.done;
    }

    expect(chatTurnState(chartId)).toEqual({ busy: false, partial: "" });
  });
});

describe("toDisplayMessages", () => {
  it("maps user text and assistant text/toolCall blocks to display rows, and skips toolResult rows", () => {
    const rows: ChatMessageRow[] = [
      { id: "r1", sessionId: "s1", ts: "t1", role: "user", payload: { role: "user", content: "你好", timestamp: 0 } },
      {
        id: "r2",
        sessionId: "s1",
        ts: "t2",
        role: "assistant",
        payload: {
          role: "assistant",
          content: [
            { type: "text", text: "先看数据" },
            { type: "toolCall", id: "c1", name: "fetch_news", arguments: {} },
          ],
          api: "anthropic-messages",
          provider: "anthropic",
          model: "x",
          usage: ZERO_USAGE,
          stopReason: "toolUse",
          timestamp: 0,
        },
      },
      {
        id: "r3",
        sessionId: "s1",
        ts: "t3",
        role: "toolResult",
        payload: {
          role: "toolResult",
          toolCallId: "c1",
          toolName: "fetch_news",
          content: [{ type: "text", text: "..." }],
          isError: false,
          timestamp: 0,
        },
      },
    ];

    expect(toDisplayMessages(rows)).toEqual([
      { id: "r1", ts: "t1", kind: "user", text: "你好" },
      { id: "r2", ts: "t2", kind: "assistant", text: "先看数据" },
      { id: "r2:1", ts: "t2", kind: "tool", label: "fetch_news" },
    ]);
  });
});

describe("buildChatSystemPrompt", () => {
  it("includes symbol, prediction JSON, a comment line, and the frozen-prediction discipline phrase", () => {
    const doc = fakeDoc({
      symbol: "MU.US",
      created_at: "2026-07-05T14:00:00.000Z",
      input: { prediction: { direction: "long", comment: "结构完好" } },
    });
    const comments: CockpitComment[] = [
      { ts: "2026-07-05T14:05:00.000Z", symbol: "MU.US", level: "info", text: "开盘走强", source: "analyst" },
      { ts: "2026-07-05T14:10:00.000Z", symbol: "MU.US", level: "info", text: "闲聊", source: "commentator" },
    ];

    const prompt = buildChatSystemPrompt(doc, comments);

    expect(prompt).toContain("MU.US");
    expect(prompt).toContain(JSON.stringify({ direction: "long", comment: "结构完好" }));
    expect(prompt).toMatch(/\d{2}:\d{2} 开盘走强/);
    expect(prompt).not.toContain("闲聊");
    expect(prompt).toContain("已归档的预测是冻结记录");
  });

  it("says the analysis carries no prediction when input.prediction is absent", () => {
    const prompt = buildChatSystemPrompt(fakeDoc({ input: {} }), []);
    expect(prompt).toContain("该分析未附带预测结论");
  });
});
