import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import type { Connection } from "../src/realtime/connection.js";

vi.mock("../src/ai/comments.js", () => ({
  onComment: vi.fn(() => () => {}),
  listComments: vi.fn(async () => []),
}));
vi.mock("../src/ai/chat.js", () => ({
  onChatEvent: vi.fn(),
  chatTurnState: vi.fn(),
}));
vi.mock("../src/realtime/analyses.js", () => ({ subscribeAnalyses: vi.fn(() => () => {}) }));
vi.mock("../src/realtime/benchmark.js", () => ({ subscribeBenchmark: vi.fn(() => () => {}) }));
vi.mock("../src/realtime/board.js", () => ({ subscribeBoard: vi.fn(() => () => {}) }));
vi.mock("../src/realtime/charts.js", () => ({ subscribeChart: vi.fn(() => () => {}) }));
vi.mock("../src/realtime/position.js", () => ({ subscribePosition: vi.fn(() => () => {}) }));
vi.mock("../src/realtime/quotes.js", () => ({ subscribeQuotes: vi.fn(() => () => {}) }));

const { parseWsMessage, handleConnection } = await import("../src/realtime/channelProtocol.js");
const { attachWs } = await import("../src/realtime/wsHost.js");
const { activeLeaseSymbols, hasActiveLease, LEASE_GRACE_MS, resetLeases } = await import("../src/ai/leases.js");
const { emitNotice } = await import("../src/ai/notices.js");
const { subscribeBoard } = (await import("../src/realtime/board.js")) as unknown as {
  subscribeBoard: ReturnType<typeof vi.fn>;
};
const { subscribeQuotes } = (await import("../src/realtime/quotes.js")) as unknown as {
  subscribeQuotes: ReturnType<typeof vi.fn>;
};
const { onChatEvent, chatTurnState } = (await import("../src/ai/chat.js")) as unknown as {
  onChatEvent: ReturnType<typeof vi.fn>;
  chatTurnState: ReturnType<typeof vi.fn>;
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
    expect(parseWsMessage({ op: "sub", key: "k", kind: "nope" })).toBeNull();
    expect(parseWsMessage({ op: "sub", key: "x".repeat(201), kind: "quotes" })).toBeNull();
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

describe("comments lease wiring", () => {
  beforeEach(() => {
    resetLeases();
  });

  it("acquires a lease when subscribing to a symbol's comments channel", async () => {
    const socket = makeSocket();
    socket.emitMessage(JSON.stringify({ op: "sub", key: "c1", kind: "comments", symbol: "mu" }));
    await waitFor(() => hasActiveLease("MU.US"));
    expect(hasActiveLease("MU.US")).toBe(true);
  });

  it("releases the lease on explicit unsubscribe (grace window, then expiry)", async () => {
    const socket = makeSocket();
    socket.emitMessage(JSON.stringify({ op: "sub", key: "c1", kind: "comments", symbol: "mu" }));
    await waitFor(() => hasActiveLease("MU.US"));
    socket.emitMessage(JSON.stringify({ op: "unsub", key: "c1" }));
    expect(hasActiveLease("MU.US")).toBe(true);
    expect(hasActiveLease("MU.US", Date.now() + LEASE_GRACE_MS + 1)).toBe(false);
  });

  it("releases the lease exactly once on socket close with an active subscription", async () => {
    const socket = makeSocket();
    socket.emitMessage(JSON.stringify({ op: "sub", key: "c1", kind: "comments", symbol: "mu" }));
    await waitFor(() => hasActiveLease("MU.US"));
    socket.emitClose();
    expect(hasActiveLease("MU.US", Date.now() + LEASE_GRACE_MS + 1)).toBe(false);
  });

  it("does not double-release when explicit unsubscribe is followed by socket close", async () => {
    const socket = makeSocket();
    socket.emitMessage(JSON.stringify({ op: "sub", key: "c1", kind: "comments", symbol: "mu" }));
    await waitFor(() => hasActiveLease("MU.US"));

    const t0 = Date.now();
    socket.emitMessage(JSON.stringify({ op: "unsub", key: "c1" }));
    await new Promise((r) => setTimeout(r, 20));
    socket.emitClose();

    expect(hasActiveLease("MU.US", t0 + LEASE_GRACE_MS - 5)).toBe(true);
    expect(hasActiveLease("MU.US", t0 + LEASE_GRACE_MS + 50)).toBe(false);
  });

  it("does not create a lease for a non-comments channel subscribe", async () => {
    const socket = makeSocket();
    socket.emitMessage(JSON.stringify({ op: "sub", key: "b1", kind: "board" }));
    await new Promise((r) => setTimeout(r, 20));
    expect(activeLeaseSymbols()).toEqual([]);
  });
});

describe("comments channel notice forwarding", () => {
  beforeEach(() => {
    resetLeases();
  });

  it("delivers a notice envelope for the subscribed symbol", async () => {
    const socket = makeSocket();
    socket.emitMessage(JSON.stringify({ op: "sub", key: "c1", kind: "comments", symbol: "mu" }));
    await waitFor(() => hasActiveLease("MU.US"));

    emitNotice({
      symbol: "MU.US",
      kind: "analysis_done",
      title: "MU.US AI 分析完成",
      body: "done",
      at: "2026-07-07T15:00:00.000Z",
    });

    await waitFor(() => socket.sent.some((raw) => raw.includes('"type":"notice"')));
    const payload = JSON.parse(socket.sent.find((raw) => raw.includes('"type":"notice"'))!);
    expect(payload.key).toBe("c1");
    expect(payload.payload.notice.title).toBe("MU.US AI 分析完成");
  });

  it("stops delivering notices after unsubscribe and still releases the lease exactly once", async () => {
    const socket = makeSocket();
    socket.emitMessage(JSON.stringify({ op: "sub", key: "c1", kind: "comments", symbol: "mu" }));
    await waitFor(() => hasActiveLease("MU.US"));

    socket.emitMessage(JSON.stringify({ op: "unsub", key: "c1" }));
    expect(hasActiveLease("MU.US", Date.now() + LEASE_GRACE_MS + 1)).toBe(false);

    emitNotice({
      symbol: "MU.US",
      kind: "analysis_done",
      title: "should not arrive",
      body: "done",
      at: "2026-07-07T15:00:00.000Z",
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(socket.sent.some((raw) => raw.includes('"type":"notice"'))).toBe(false);
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
});
