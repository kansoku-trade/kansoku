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
    subscribeChannel({ kind: "board" }, vi.fn(), onConnected2);
    await flush();
    expect(onConnected2).toHaveBeenCalledWith(true);
    expect(win.ports).toHaveLength(2);

    win.ports[1].emitClose();
    await flush();

    expect(win.ports.length).toBeGreaterThanOrEqual(3);
  });
});
