import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PortLike } from "../src/realtimeBridge.js";

const handleConnection = vi.fn();
vi.mock("../../server/src/realtime/channelProtocol.js", () => ({ handleConnection }));

interface FakeIpcMainEvent {
  ports: FakePort[];
}

const ipcMainListeners = new Map<string, (event: FakeIpcMainEvent) => void>();
const ipcMain = {
  on: vi.fn((channel: string, listener: (event: FakeIpcMainEvent) => void) => {
    ipcMainListeners.set(channel, listener);
  }),
};
vi.mock("electron", () => ({ ipcMain }));

const { attachRealtimeBridge, wrapMessagePort } = await import("../src/realtimeBridge.js");

class FakePort implements PortLike {
  sent: unknown[] = [];
  started = false;
  private messageListeners: ((e: { data: unknown }) => void)[] = [];
  private closeListeners: (() => void)[] = [];

  postMessage(message: unknown): void {
    this.sent.push(message);
  }
  on(event: "message" | "close", listener: never): unknown {
    if (event === "message") this.messageListeners.push(listener as (e: { data: unknown }) => void);
    else this.closeListeners.push(listener as () => void);
    return this;
  }
  start(): void {
    this.started = true;
  }
  emitMessage(data: unknown): void {
    for (const cb of this.messageListeners) cb({ data });
  }
  emitClose(): void {
    for (const cb of this.closeListeners) cb();
  }
}

describe("wrapMessagePort", () => {
  it("bridges send/onMessage/onClose to the port", () => {
    const port = new FakePort();
    const conn = wrapMessagePort(port);

    conn.send("hello");
    expect(port.sent).toEqual(["hello"]);

    const received: string[] = [];
    conn.onMessage((text) => received.push(text));
    port.emitMessage("world");
    expect(received).toEqual(["world"]);

    let closed = false;
    conn.onClose(() => {
      closed = true;
    });
    port.emitClose();
    expect(closed).toBe(true);
  });

  it("stringifies non-string message payloads", () => {
    const port = new FakePort();
    const conn = wrapMessagePort(port);
    const received: string[] = [];
    conn.onMessage((text) => received.push(text));
    port.emitMessage(42);
    expect(received).toEqual(["42"]);
  });
});

describe("attachRealtimeBridge", () => {
  beforeEach(() => {
    ipcMainListeners.clear();
    handleConnection.mockReset();
  });

  it("registers a desktop-rt-connect handler that hands the port to handleConnection", () => {
    attachRealtimeBridge();
    expect(ipcMain.on).toHaveBeenCalledWith("desktop-rt-connect", expect.any(Function));

    const port = new FakePort();
    ipcMainListeners.get("desktop-rt-connect")?.({ ports: [port] });

    expect(handleConnection).toHaveBeenCalledTimes(1);
    expect(port.started).toBe(true);
  });

  it("ignores a handshake event with no transferred port", () => {
    attachRealtimeBridge();
    ipcMainListeners.get("desktop-rt-connect")?.({ ports: [] });
    expect(handleConnection).not.toHaveBeenCalled();
  });

  it("runs handleConnection cleanup when the port closes", () => {
    attachRealtimeBridge();
    const port = new FakePort();
    ipcMainListeners.get("desktop-rt-connect")?.({ ports: [port] });

    const conn = handleConnection.mock.calls[0][0] as { onClose: (cb: () => void) => void };
    let cleaned = false;
    conn.onClose(() => {
      cleaned = true;
    });
    port.emitClose();
    expect(cleaned).toBe(true);
  });
});
