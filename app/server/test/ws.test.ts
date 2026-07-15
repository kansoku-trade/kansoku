import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import type { Connection } from "../../packages/core/src/realtime/connection.js";

const comments = vi.hoisted(() => ({
  onComment: vi.fn(() => () => {}),
  onAnyComment: vi.fn((_listener: (comment: unknown) => void) => () => {}),
  listComments: vi.fn(async () => []),
}));

vi.mock("../../packages/core/src/ai/comments.js", () => comments);
vi.mock("../../packages/core/src/ai/chat.js", () => ({
  onChatEvent: vi.fn(),
  chatTurnState: vi.fn(),
}));
vi.mock("../../packages/core/src/ai/researchChat.js", () => ({
  onResearchChatEvent: vi.fn(),
  researchChatTurnState: vi.fn(),
}));
vi.mock("../../packages/core/src/ai/assistantChat.js", () => ({
  onAssistantChatEvent: vi.fn(),
  assistantChatTurnState: vi.fn(),
}));
vi.mock("../../packages/core/src/ai/researchRefresh.js", () => ({
  getLatestResearchRefreshTask: vi.fn(),
  onResearchRefreshEvent: vi.fn(),
}));
vi.mock("../../packages/core/src/realtime/analyses.js", () => ({ subscribeAnalyses: vi.fn(() => () => {}) }));
vi.mock("../../packages/core/src/realtime/benchmark.js", () => ({ subscribeBenchmark: vi.fn(() => () => {}) }));
vi.mock("../../packages/core/src/realtime/board.js", () => ({ subscribeBoard: vi.fn(() => () => {}) }));
vi.mock("../../packages/core/src/realtime/charts.js", () => ({ subscribeChart: vi.fn(() => () => {}) }));
vi.mock("../../packages/core/src/realtime/position.js", () => ({ subscribePosition: vi.fn(() => () => {}) }));
vi.mock("../../packages/core/src/realtime/quotes.js", () => ({ subscribeQuotes: vi.fn(() => () => {}) }));

const { parseWsMessage, handleConnection } = await import("../../packages/core/src/realtime/channelProtocol.js");
const { attachWs } = await import("../src/realtime/wsHost.js");
const { emitNotice } = await import("../../packages/core/src/ai/notices.js");
const { subscribeBoard } = (await import("../../packages/core/src/realtime/board.js")) as unknown as {
  subscribeBoard: ReturnType<typeof vi.fn>;
};
const { subscribeQuotes } = (await import("../../packages/core/src/realtime/quotes.js")) as unknown as {
  subscribeQuotes: ReturnType<typeof vi.fn>;
};
const { onChatEvent, chatTurnState } = (await import("../../packages/core/src/ai/chat.js")) as unknown as {
  onChatEvent: ReturnType<typeof vi.fn>;
  chatTurnState: ReturnType<typeof vi.fn>;
};
const { onResearchChatEvent, researchChatTurnState } = (await import(
  "../../packages/core/src/ai/researchChat.js"
)) as unknown as {
  onResearchChatEvent: ReturnType<typeof vi.fn>;
  researchChatTurnState: ReturnType<typeof vi.fn>;
};
const { getLatestResearchRefreshTask, onResearchRefreshEvent } = (await import(
  "../../packages/core/src/ai/researchRefresh.js"
)) as unknown as {
  getLatestResearchRefreshTask: ReturnType<typeof vi.fn>;
  onResearchRefreshEvent: ReturnType<typeof vi.fn>;
};
const { onAssistantChatEvent, assistantChatTurnState } = (await import(
  "../../packages/core/src/ai/assistantChat.js"
)) as unknown as {
  onAssistantChatEvent: ReturnType<typeof vi.fn>;
  assistantChatTurnState: ReturnType<typeof vi.fn>;
};

class FakeConnection implements Connection {
  sent: string[] = [];
  private messageListeners: ((text: string) => void)[] = [];
  private closeListeners: (() => void)[] = [];

  send(text: string): void {
    this.sent.push(text);
  }
  onMessage(cb: (text: string) => void): void {
    this.messageListeners.push(cb);
  }
  onClose(cb: () => void): void {
    this.closeListeners.push(cb);
  }
  emitMessage(text: string): void {
    for (const cb of this.messageListeners) cb(text);
  }
  emitClose(): void {
    for (const cb of this.closeListeners) cb();
  }
}

function makeSocket(): FakeConnection {
  const conn = new FakeConnection();
  handleConnection(conn);
  return conn;
}

async function waitFor(check: () => boolean): Promise<void> {
  await vi.waitFor(() => {
    if (!check()) throw new Error("condition not met");
  });
}

describe("parseWsMessage", () => {
  it("parses a quotes sub with extra symbols", () => {
    expect(parseWsMessage({ op: "sub", key: "k1", kind: "quotes", extra: ["MU.US", 3] })).toEqual({
      op: "sub",
      key: "k1",
      kind: "quotes",
      extra: ["MU.US"],
    });
  });

  it("parses chart and comments subs", () => {
    expect(parseWsMessage({ op: "sub", key: "k2", kind: "chart", id: "2026-07-06-mu", count: 150 })).toEqual({
      op: "sub",
      key: "k2",
      kind: "chart",
      id: "2026-07-06-mu",
      count: 150,
    });
    expect(parseWsMessage({ op: "sub", key: "k3", kind: "comments", symbol: "mu" })).toEqual({
      op: "sub",
      key: "k3",
      kind: "comments",
      symbol: "mu",
    });
    expect(parseWsMessage({ op: "sub", key: "k4", kind: "notifications" })).toEqual({
      op: "sub",
      key: "k4",
      kind: "notifications",
    });
  });

  it("parses an analyses sub", () => {
    expect(parseWsMessage({ op: "sub", key: "k4", kind: "analyses", symbol: "mu" })).toEqual({
      op: "sub",
      key: "k4",
      kind: "analyses",
      symbol: "mu",
    });
    expect(parseWsMessage({ op: "sub", key: "k", kind: "analyses" })).toBeNull();
  });

  it("parses position, benchmark and board subs", () => {
    expect(parseWsMessage({ op: "sub", key: "k5", kind: "position", symbol: "mu" })).toEqual({
      op: "sub",
      key: "k5",
      kind: "position",
      symbol: "mu",
    });
    expect(parseWsMessage({ op: "sub", key: "k6", kind: "benchmark", symbol: "mu" })).toEqual({
      op: "sub",
      key: "k6",
      kind: "benchmark",
      symbol: "mu",
    });
    expect(parseWsMessage({ op: "sub", key: "k7", kind: "board" })).toEqual({
      op: "sub",
      key: "k7",
      kind: "board",
    });
  });

  it("parses a chat sub", () => {
    expect(parseWsMessage({ op: "sub", key: "k8", kind: "chat", id: "chart-1" })).toEqual({
      op: "sub",
      key: "k8",
      kind: "chat",
      id: "chart-1",
    });
  });

  it("parses a research chat sub", () => {
    expect(parseWsMessage({ op: "sub", key: "k9", kind: "research-chat", path: "stocks/MU.md" })).toEqual({
      op: "sub",
      key: "k9",
      kind: "research-chat",
      path: "stocks/MU.md",
    });
  });

  it("parses a research refresh sub", () => {
    expect(parseWsMessage({ op: "sub", key: "k10", kind: "research-refresh", path: "stocks/MU.md" })).toEqual({
      op: "sub",
      key: "k10",
      kind: "research-refresh",
      path: "stocks/MU.md",
    });
  });

  it("parses unsub", () => {
    expect(parseWsMessage({ op: "unsub", key: "k1" })).toEqual({ op: "unsub", key: "k1" });
  });

  it("rejects garbage", () => {
    expect(parseWsMessage(null)).toBeNull();
    expect(parseWsMessage({ op: "sub", key: "", kind: "quotes" })).toBeNull();
    expect(parseWsMessage({ op: "sub", key: "k", kind: "chart" })).toBeNull();
    expect(parseWsMessage({ op: "sub", key: "k", kind: "comments" })).toBeNull();
    expect(parseWsMessage({ op: "sub", key: "k", kind: "position" })).toBeNull();
    expect(parseWsMessage({ op: "sub", key: "k", kind: "benchmark" })).toBeNull();
    expect(parseWsMessage({ op: "sub", key: "k", kind: "chat" })).toBeNull();
    expect(parseWsMessage({ op: "sub", key: "k", kind: "research-chat" })).toBeNull();
    expect(parseWsMessage({ op: "sub", key: "k", kind: "research-refresh" })).toBeNull();
    expect(parseWsMessage({ op: "sub", key: "k", kind: "nope" })).toBeNull();
    expect(parseWsMessage({ op: "sub", key: "x".repeat(201), kind: "quotes" })).toBeNull();
  });
});

describe("research refresh channel", () => {
  beforeEach(() => {
    getLatestResearchRefreshTask.mockReset();
    onResearchRefreshEvent.mockReset();
  });

  it("pushes persisted state and live task updates", async () => {
    let capturedListener: ((task: unknown) => void) | undefined;
    const initial = { id: "refresh-1", path: "stocks/MU.md", status: "running", phase: "documents" };
    getLatestResearchRefreshTask.mockResolvedValue(initial);
    onResearchRefreshEvent.mockImplementation((_path: string, listener: (task: unknown) => void) => {
      capturedListener = listener;
      return vi.fn();
    });

    const socket = makeSocket();
    socket.emitMessage(JSON.stringify({ op: "sub", key: "refresh1", kind: "research-refresh", path: "stocks/MU.md" }));
    await waitFor(() => socket.sent.some((raw) => raw.includes('"type":"init"')));

    expect(onResearchRefreshEvent).toHaveBeenCalledWith("stocks/MU.md", expect.any(Function));
    expect(JSON.parse(socket.sent.find((raw) => raw.includes('"type":"init"'))!)).toEqual({
      key: "refresh1",
      payload: { type: "init", task: initial },
    });

    const completed = { ...initial, status: "completed", phase: "completed" };
    capturedListener?.(completed);
    await waitFor(() => socket.sent.some((raw) => raw.includes('"type":"task"')));
    expect(JSON.parse(socket.sent.find((raw) => raw.includes('"type":"task"'))!)).toEqual({
      key: "refresh1",
      payload: { type: "task", task: completed },
    });
  });
});

describe("research chat channel", () => {
  beforeEach(() => {
    onResearchChatEvent.mockReset();
    researchChatTurnState.mockReset();
  });

  it("pushes document-scoped init state and live events", async () => {
    let capturedListener: ((event: unknown) => void) | undefined;
    researchChatTurnState.mockReturnValue({ busy: true, partial: "正在核对" });
    onResearchChatEvent.mockImplementation((_path: string, listener: (event: unknown) => void) => {
      capturedListener = listener;
      return vi.fn();
    });

    const socket = makeSocket();
    socket.emitMessage(JSON.stringify({ op: "sub", key: "research1", kind: "research-chat", path: "stocks/MU.md" }));
    await waitFor(() => socket.sent.some((raw) => raw.includes('"type":"init"')));

    expect(onResearchChatEvent).toHaveBeenCalledWith("stocks/MU.md", expect.any(Function));
    expect(JSON.parse(socket.sent.find((raw) => raw.includes('"type":"init"'))!)).toEqual({
      key: "research1",
      payload: { type: "init", busy: true, partial: "正在核对" },
    });

    capturedListener?.({ event: "delta", text: "结论" });
    await waitFor(() => socket.sent.some((raw) => raw.includes('"type":"event"')));
    expect(JSON.parse(socket.sent.find((raw) => raw.includes('"type":"event"'))!)).toEqual({
      key: "research1",
      payload: { type: "event", event: { event: "delta", text: "结论" } },
    });
  });
});

describe("assistant chat channel", () => {
  beforeEach(() => {
    onAssistantChatEvent.mockReset();
    assistantChatTurnState.mockReset();
  });

  it("pushes session-scoped init state and live events", async () => {
    let capturedListener: ((event: unknown) => void) | undefined;
    assistantChatTurnState.mockReturnValue({ busy: true, partial: "正在核对" });
    onAssistantChatEvent.mockImplementation((_id: string, listener: (event: unknown) => void) => {
      capturedListener = listener;
      return vi.fn();
    });

    const socket = makeSocket();
    socket.emitMessage(JSON.stringify({ op: "sub", key: "assistant1", kind: "assistant-chat", id: "session-1" }));
    await waitFor(() => socket.sent.some((raw) => raw.includes('"type":"init"')));

    expect(onAssistantChatEvent).toHaveBeenCalledWith("session-1", expect.any(Function));
    expect(JSON.parse(socket.sent.find((raw) => raw.includes('"type":"init"'))!)).toEqual({
      key: "assistant1",
      payload: { type: "init", busy: true, partial: "正在核对" },
    });

    capturedListener?.({ event: "delta", text: "结论" });
    await waitFor(() => socket.sent.some((raw) => raw.includes('"type":"event"')));
    expect(JSON.parse(socket.sent.find((raw) => raw.includes('"type":"event"'))!)).toEqual({
      key: "assistant1",
      payload: { type: "event", event: { event: "delta", text: "结论" } },
    });
  });
});

describe("chat channel", () => {
  beforeEach(() => {
    onChatEvent.mockReset();
    chatTurnState.mockReset();
  });

  it("pushes init before forwarding a live event", async () => {
    let capturedListener: ((event: unknown) => void) | undefined;
    const unsubFn = vi.fn();
    chatTurnState.mockReturnValue({ busy: true, partial: "部分回答" });
    onChatEvent.mockImplementation((_id: string, listener: (event: unknown) => void) => {
      capturedListener = listener;
      return unsubFn;
    });

    const socket = makeSocket();
    socket.emitMessage(JSON.stringify({ op: "sub", key: "chat1", kind: "chat", id: "chart-1" }));
    await waitFor(() => socket.sent.some((raw) => raw.includes('"type":"init"')));

    expect(onChatEvent).toHaveBeenCalledWith("chart-1", expect.any(Function));
    const initEnvelope = JSON.parse(socket.sent.find((raw) => raw.includes('"type":"init"'))!);
    expect(initEnvelope).toEqual({ key: "chat1", payload: { type: "init", busy: true, partial: "部分回答" } });

    capturedListener?.({ event: "delta", text: "hi" });
    await waitFor(() => socket.sent.some((raw) => raw.includes('"type":"event"')));
    const eventEnvelope = JSON.parse(socket.sent.find((raw) => raw.includes('"type":"event"'))!);
    expect(eventEnvelope).toEqual({
      key: "chat1",
      payload: { type: "event", event: { event: "delta", text: "hi" } },
    });
  });

  it("stops forwarding on unsub", async () => {
    const unsubFn = vi.fn();
    chatTurnState.mockReturnValue({ busy: false, partial: "" });
    onChatEvent.mockImplementation(() => unsubFn);

    const socket = makeSocket();
    socket.emitMessage(JSON.stringify({ op: "sub", key: "chat1", kind: "chat", id: "chart-1" }));
    await waitFor(() => socket.sent.some((raw) => raw.includes('"type":"init"')));

    socket.emitMessage(JSON.stringify({ op: "unsub", key: "chat1" }));
    expect(unsubFn).toHaveBeenCalledTimes(1);
  });
});

describe("global notifications channel", () => {
  beforeEach(() => {
    comments.onAnyComment.mockReset();
    comments.onAnyComment.mockImplementation((_listener) => () => {});
  });

  it("forwards alert comments without opening a symbol comments channel", async () => {
    let listener: ((comment: unknown) => void) | undefined;
    comments.onAnyComment.mockImplementation((next: (comment: unknown) => void) => {
      listener = next;
      return () => {};
    });
    const socket = makeSocket();
    socket.emitMessage(JSON.stringify({ op: "sub", key: "n1", kind: "notifications" }));
    await waitFor(() => Boolean(listener));

    listener?.({
      ts: "2026-07-07T15:00:00.000Z",
      symbol: "MU.US",
      level: "alert",
      text: "触及止损",
      source: "commentator",
    });

    await waitFor(() => socket.sent.some((raw) => raw.includes('"type":"comment"')));
    const payload = JSON.parse(socket.sent.find((raw) => raw.includes('"type":"comment"'))!);
    expect(payload.key).toBe("n1");
    expect(payload.payload.comment.text).toBe("触及止损");
  });

  it("forwards analysis notices without opening a chart", async () => {
    const socket = makeSocket();
    socket.emitMessage(JSON.stringify({ op: "sub", key: "n2", kind: "notifications" }));
    await waitFor(() => comments.onAnyComment.mock.calls.length > 0);

    emitNotice({
      symbol: "MU.US",
      kind: "analysis_done",
      title: "MU.US AI 分析完成",
      body: "done",
      at: "2026-07-07T15:00:00.000Z",
    });

    await waitFor(() => socket.sent.some((raw) => raw.includes('"type":"notice"')));
    const payload = JSON.parse(socket.sent.find((raw) => raw.includes('"type":"notice"'))!);
    expect(payload.key).toBe("n2");
    expect(payload.payload.notice.title).toBe("MU.US AI 分析完成");
  });
});

describe("MAX_CHANNELS_PER_SOCKET cap", () => {
  afterEach(() => {
    subscribeQuotes.mockReset();
    subscribeQuotes.mockImplementation(() => () => {});
  });

  it("drops a sub beyond the cap without evicting existing subs", async () => {
    const unsubFns: ReturnType<typeof vi.fn>[] = [];
    subscribeQuotes.mockImplementation((push: (envelope: string) => void) => {
      push(JSON.stringify({ type: "quote" }));
      const unsub = vi.fn();
      unsubFns.push(unsub);
      return unsub;
    });

    const socket = makeSocket();
    for (let i = 0; i < 16; i++) {
      socket.emitMessage(JSON.stringify({ op: "sub", key: `k${i}`, kind: "quotes" }));
    }
    await waitFor(() => subscribeQuotes.mock.calls.length === 16);
    expect(socket.sent.filter((raw) => raw.includes('"type":"quote"'))).toHaveLength(16);

    socket.emitMessage(JSON.stringify({ op: "sub", key: "k16", kind: "quotes" }));
    await new Promise((r) => setTimeout(r, 20));

    expect(subscribeQuotes).toHaveBeenCalledTimes(16);
    expect(socket.sent.some((raw) => raw.includes('"key":"k16"'))).toBe(false);

    socket.emitMessage(JSON.stringify({ op: "unsub", key: "k0" }));
    expect(unsubFns[0]).toHaveBeenCalledTimes(1);
  });
});

describe("degraded status on attachChannel failure", () => {
  afterEach(() => {
    subscribeQuotes.mockReset();
    subscribeQuotes.mockImplementation(() => () => {});
  });

  it("sends the exact degraded envelope and allows re-subscribing the same key", async () => {
    subscribeQuotes.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    subscribeQuotes.mockImplementation(() => () => {});

    const socket = makeSocket();
    socket.emitMessage(JSON.stringify({ op: "sub", key: "q1", kind: "quotes" }));
    await waitFor(() => socket.sent.some((raw) => raw.includes('"type":"status"')));

    const envelope = JSON.parse(socket.sent.find((raw) => raw.includes('"type":"status"'))!);
    expect(envelope).toEqual({ key: "q1", payload: { type: "status", degraded: true, error: "boom" } });

    socket.emitMessage(JSON.stringify({ op: "sub", key: "q1", kind: "quotes" }));
    await waitFor(() => subscribeQuotes.mock.calls.length === 2);
    expect(subscribeQuotes).toHaveBeenCalledTimes(2);
  });
});

describe("attachWs (node http.Server integration)", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    subscribeBoard.mockReset();
    server = createServer();
    attachWs(server, "/api/ws");
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `ws://127.0.0.1:${port}/api/ws`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("round-trips a real sub through a live socket", async () => {
    subscribeBoard.mockImplementation((push: (envelope: string) => void) => {
      push(JSON.stringify({ type: "board", value: 42 }));
      return () => {};
    });

    const client = new WebSocket(baseUrl);
    const received: string[] = [];
    await new Promise<void>((resolve, reject) => {
      client.on("open", resolve);
      client.on("error", reject);
    });
    client.on("message", (data) => received.push(String(data)));

    client.send(JSON.stringify({ op: "sub", key: "b1", kind: "board" }));
    await vi.waitFor(() => {
      if (received.length === 0) throw new Error("no message yet");
    });

    expect(JSON.parse(received[0])).toEqual({ key: "b1", payload: { type: "board", value: 42 } });
    client.close();
  });

  it("destroys the socket on an upgrade request to the wrong path", async () => {
    const client = new WebSocket(baseUrl.replace("/api/ws", "/nope"));
    await new Promise<void>((resolve, reject) => {
      client.on("close", () => resolve());
      client.on("open", () => reject(new Error("should not upgrade")));
      client.on("error", () => {});
    });
  });

  it("still upgrades when the path carries a query string", async () => {
    subscribeBoard.mockImplementation((push: (envelope: string) => void) => {
      push(JSON.stringify({ type: "board", value: 7 }));
      return () => {};
    });

    const client = new WebSocket(`${baseUrl}?foo=1`);
    const received: string[] = [];
    await new Promise<void>((resolve, reject) => {
      client.on("open", resolve);
      client.on("error", reject);
    });
    client.on("message", (data) => received.push(String(data)));

    client.send(JSON.stringify({ op: "sub", key: "b1", kind: "board" }));
    await vi.waitFor(() => {
      if (received.length === 0) throw new Error("no message yet");
    });

    expect(JSON.parse(received[0])).toEqual({ key: "b1", payload: { type: "board", value: 7 } });
    client.close();
  });
});
