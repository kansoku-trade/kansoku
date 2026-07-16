import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEvent } from "@earendil-works/pi-agent-core";
import type { AiAgentFactory, AiAgentHandle } from "../src/ai/agentSession.js";
import type { AiModel } from "../src/ai/models.js";
import { runAssistantChatTurn } from "../src/ai/assistantChat.js";
import { type AnalystDeps, runAnalyst } from "../src/ai/analyst.js";
import { createAssistantSession } from "../src/ai/assistantChatStore.js";
import type { ReassessPack } from "../src/ai/datapack.js";
import { createDb, type Db } from "../src/db/index.js";
import type { Connection } from "../src/realtime/connection.js";
import { afterEach, describe, expect, it } from "vitest";
import { handleConnection, parseWsMessage } from "../src/realtime/channelProtocol.js";

const model = { provider: "anthropic", id: "test-model" } as unknown as AiModel;
const analystSandboxes = new Set<string>();

afterEach(() => {
  for (const sandbox of analystSandboxes) rmSync(sandbox, { recursive: true, force: true });
  analystSandboxes.clear();
});

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

type Tools = Parameters<AiAgentFactory>[0]["tools"];

function tool(tools: Tools, name: string) {
  const t = tools.find((x) => x.name === name);
  if (!t) throw new Error(`missing tool ${name}`);
  return t;
}

function makePack(): ReassessPack {
  return {
    symbol: "CHANNEL.US",
    as_of: "2026-07-16T15:00:00.000Z",
    timeframes: {} as ReassessPack["timeframes"],
    flow: [],
    rel_volume: null,
    day_levels: null,
    day_context: null,
    options_levels: null,
    event_risk: null,
    lessons: [],
    market: { spy: null, qqq: null },
    news: [],
    prediction: null,
    prediction_chart_id: null,
    position: null,
  };
}

const validPrediction = {
  direction: "long" as const,
  anchor: { timeframe: "m5" as const, time: "2026-07-16T15:00:00Z", price: 100 },
  entry_plan: { entry: 100, stop: 97, target1: 104, target2: 108 },
  scenarios: [
    { label: "上破", probability: 50 },
    { label: "震荡", probability: 30 },
    { label: "下破", probability: 20 },
  ],
  comment: "多头结构完好，站上 100 看 104。",
};

function makeAnalystDeps(script: (tools: Tools) => Promise<void>): AnalystDeps {
  const sandbox = mkdtempSync(join(tmpdir(), "analyst-channel-test-"));
  analystSandboxes.add(sandbox);
  const agentFactory: AiAgentFactory = ({ tools }) => {
    const agent: AiAgentHandle = {
      prompt: async () => script(tools),
      abort: () => undefined,
    };
    return agent;
  };
  return {
    model: { provider: "anthropic", id: "test-model" } as unknown as AiModel,
    agentFactory,
    buildReassessPack: async () => makePack(),
    fetchNews: async () => [],
    fetchKline: async () => [],
    createChart: async () => ({ id: "chart-1", url: "http://localhost/#/charts/chart-1" }),
    appendComment: async () => {},
    repoRoot: sandbox,
    journalDir: join(sandbox, "journal"),
    exec: async () => ({ stdout: "", stderr: "" }),
    skillText: "# intraday-signal\n假技能全文。",
    disciplineText: "# trading-discipline\n假纪律全文。",
  };
}

describe("parseWsMessage analyst-runs kind", () => {
  it("parses a valid analyst-runs subscription", () => {
    expect(parseWsMessage({ op: "sub", key: "k1", kind: "analyst-runs" })).toEqual({
      op: "sub",
      key: "k1",
      kind: "analyst-runs",
    });
  });
});

describe("analyst-runs channel", () => {
  it("includes an already-running entry in the init snapshot", async () => {
    const symbol = "INIT.US";
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const deps = makeAnalystDeps(async () => {
      await gate;
    });

    const run = runAnalyst({ symbol, origin: "manual", deps });
    expect(run.started).toBe(true);
    if (!run.started) return;

    const conn = makeConnection();
    try {
      handleConnection(conn);
      conn.emitMessage(JSON.stringify({ op: "sub", key: "runs1", kind: "analyst-runs" }));
      await waitFor(() => conn.sent.length > 0);

      const init = JSON.parse(conn.sent[0]);
      expect(init.key).toBe("runs1");
      expect(init.payload.type).toBe("init");
      expect(init.payload.runs).toContainEqual(
        expect.objectContaining({ symbol, status: expect.objectContaining({ running: true }) }),
      );
    } finally {
      conn.close();
      release();
      await run.done;
    }
  });

  it("pushes update on phase change and running:false on run end, then stops after unsubscribe", async () => {
    const symbol = "UPDATE.US";
    let releaseTool!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseTool = resolve;
    });
    const deps = makeAnalystDeps(async (tools) => {
      await tool(tools, "read_data_pack").execute("c1", {});
      await gate;
      await tool(tools, "submit_prediction").execute("c2", validPrediction);
    });

    const conn = makeConnection();
    let run: ReturnType<typeof runAnalyst> | undefined;
    let secondRun: ReturnType<typeof runAnalyst> | undefined;
    try {
      handleConnection(conn);
      conn.emitMessage(JSON.stringify({ op: "sub", key: "runs2", kind: "analyst-runs" }));
      await waitFor(() => conn.sent.length > 0);
      conn.sent.length = 0;

      run = runAnalyst({ symbol, origin: "manual", deps });
      expect(run.started).toBe(true);
      if (!run.started) return;
      await waitFor(() =>
        conn.sent.some((raw) => {
          const msg = JSON.parse(raw);
          return msg.payload.type === "update" && msg.payload.symbol === symbol && msg.payload.status.phase === "researching";
        }),
      );

      releaseTool();
      await waitFor(() =>
        conn.sent.some((raw) => {
          const msg = JSON.parse(raw);
          return msg.payload.type === "update" && msg.payload.symbol === symbol && msg.payload.status.running === false;
        }),
      );
      await run.done;

      conn.emitMessage(JSON.stringify({ op: "unsub", key: "runs2" }));
      conn.sent.length = 0;

      const secondSymbol = "AFTER-UNSUB.US";
      const secondDeps = makeAnalystDeps(async () => {});
      secondRun = runAnalyst({ symbol: secondSymbol, origin: "manual", deps: secondDeps });
      expect(secondRun.started).toBe(true);
      if (secondRun.started) await secondRun.done;
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(conn.sent).toHaveLength(0);
    } finally {
      conn.close();
      releaseTool();
      if (run?.started) await run.done;
      if (secondRun?.started) await secondRun.done;
    }
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
