import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class FakePort {
  closed = false;
  private messageListeners: ((e: { data: unknown }) => void)[] = [];
  private closeListeners: (() => void)[] = [];

  postMessage(_data: unknown): void {}
  close(): void {
    this.closed = true;
  }
  start(): void {}
  addEventListener(type: "message" | "close", listener: never): void {
    if (type === "message") this.messageListeners.push(listener as (e: { data: unknown }) => void);
    else this.closeListeners.push(listener as () => void);
  }
  emitClose(): void {
    for (const cb of this.closeListeners) cb();
  }
}

class AutoRespondWindow {
  __DESKTOP_RT__ = true;
  ports: FakePort[] = [];
  private listeners: ((e: { source: unknown; data: unknown; ports: FakePort[] }) => void)[] = [];

  postMessage(data: unknown): void {
    if (data !== "desktop-rt-connect") return;
    const port = new FakePort();
    this.ports.push(port);
    queueMicrotask(() => {
      for (const cb of this.listeners) cb({ source: this, data: "desktop-rt-port", ports: [port] });
    });
  }
  addEventListener(
    _type: "message",
    listener: (e: { source: unknown; data: unknown; ports: FakePort[] }) => void,
  ): void {
    this.listeners.push(listener);
  }
  removeEventListener(
    _type: "message",
    listener: (e: { source: unknown; data: unknown; ports: FakePort[] }) => void,
  ): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }
  setTimeout(cb: () => void): number {
    queueMicrotask(cb);
    return 0;
  }
  clearTimeout(): void {}
}

class DelayedCloseWebSocket {
  static readonly OPEN = 1;
  static instances: DelayedCloseWebSocket[] = [];

  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  closeCalls = 0;

  constructor(readonly url: string) {
    DelayedCloseWebSocket.instances.push(this);
  }

  open(): void {
    this.readyState = DelayedCloseWebSocket.OPEN;
    this.onopen?.();
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closeCalls += 1;
    this.readyState = 3;
  }

  finishClose(): void {
    this.readyState = 3;
    this.onclose?.();
  }
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("wsHub reconnect regression (port transport)", () => {
  let win: AutoRespondWindow;

  beforeEach(() => {
    vi.resetModules();
    win = new AutoRespondWindow();
    vi.stubGlobal("window", win);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reconnects after subscribe -> unsub-all -> resubscribe -> peer death", async () => {
    const { subscribeChannel } = await import("./wsHub.js");

    const onConnected1 = vi.fn();
    const unsub1 = subscribeChannel({ kind: "board" }, vi.fn(), onConnected1);
    await flush();
    expect(onConnected1).toHaveBeenCalledWith(true);
    expect(win.ports).toHaveLength(1);

    unsub1();
    expect(win.ports[0].closed).toBe(true);

    const onConnected2 = vi.fn();
    const unsubscribeSecond = subscribeChannel({ kind: "board" }, vi.fn(), onConnected2);
    await flush();
    expect(onConnected2).toHaveBeenCalledWith(true);
    expect(win.ports).toHaveLength(2);

    win.ports[1].emitClose();
    await flush();

    expect(win.ports.length).toBeGreaterThanOrEqual(3);
    unsubscribeSecond();
  });

  it("tracks hub status across connect, peer death, reconnect, and unsub-all", async () => {
    const { subscribeChannel, getHubStatus, subscribeHubStatus } = await import("./wsHub.js");
    const seen: string[] = [];
    const unsubscribeStatus = subscribeHubStatus(() => seen.push(getHubStatus()));

    expect(getHubStatus()).toBe("connecting");
    const unsub = subscribeChannel({ kind: "board" }, vi.fn(), vi.fn());
    expect(getHubStatus()).toBe("connecting");
    await flush();
    expect(getHubStatus()).toBe("connected");

    win.ports[0].emitClose();
    await flush();
    expect(seen).toContain("reconnecting");
    expect(getHubStatus()).toBe("connected");

    unsub();
    expect(getHubStatus()).toBe("connecting");
    unsubscribeStatus();
  });
});

describe("wsHub socket ownership (websocket transport)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    DelayedCloseWebSocket.instances = [];
    vi.stubGlobal("window", {
      setTimeout: (callback: () => void, delay: number) => setTimeout(callback, delay) as unknown as number,
      clearTimeout: (timer: number) => clearTimeout(timer),
    });
    vi.stubGlobal("location", { protocol: "http:", host: "localhost" });
    vi.stubGlobal("WebSocket", DelayedCloseWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("ignores a delayed close from a socket replaced after unsubscribing", async () => {
    const { getHubStatus, subscribeChannel } = await import("./wsHub.js");

    const firstConnected = vi.fn();
    const unsubscribeFirst = subscribeChannel({ kind: "board" }, vi.fn(), firstConnected);
    const first = DelayedCloseWebSocket.instances[0];
    first.open();
    expect(getHubStatus()).toBe("connected");

    unsubscribeFirst();
    expect(first.closeCalls).toBe(1);
    expect(getHubStatus()).toBe("connecting");

    const secondConnected = vi.fn();
    const unsubscribeSecond = subscribeChannel({ kind: "board" }, vi.fn(), secondConnected);
    const second = DelayedCloseWebSocket.instances[1];
    second.open();
    expect(secondConnected).toHaveBeenCalledWith(true);

    first.finishClose();

    expect(getHubStatus()).toBe("connected");
    expect(secondConnected).not.toHaveBeenCalledWith(false);
    unsubscribeSecond();
  });

  it("cancels reconnect and returns to connecting when the last subscriber leaves", async () => {
    const { getHubStatus, subscribeChannel } = await import("./wsHub.js");

    const unsubscribe = subscribeChannel({ kind: "board" }, vi.fn(), vi.fn());
    const socket = DelayedCloseWebSocket.instances[0];
    socket.open();
    socket.finishClose();
    expect(getHubStatus()).toBe("reconnecting");
    expect(vi.getTimerCount()).toBe(1);

    unsubscribe();
    expect(getHubStatus()).toBe("connecting");
    expect(vi.getTimerCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(DelayedCloseWebSocket.instances).toHaveLength(1);
  });
});
