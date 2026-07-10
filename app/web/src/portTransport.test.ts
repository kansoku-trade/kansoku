import { describe, expect, it, vi } from "vitest";
import { isDesktopRealtime, PortTransport, READY_STATE, type PortLike, type WindowLike } from "./portTransport.js";

class FakePort implements PortLike {
  sent: string[] = [];
  started = false;
  closed = false;
  private messageListeners: ((e: { data: unknown }) => void)[] = [];
  private closeListeners: (() => void)[] = [];

  postMessage(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
  }
  start(): void {
    this.started = true;
  }
  addEventListener(type: "message" | "close", listener: never): void {
    if (type === "message") this.messageListeners.push(listener as (e: { data: unknown }) => void);
    else this.closeListeners.push(listener as () => void);
  }
  emitMessage(data: unknown): void {
    for (const cb of this.messageListeners) cb({ data });
  }
  emitClose(): void {
    for (const cb of this.closeListeners) cb();
  }
}

class FakeWindow implements WindowLike {
  posted: unknown[] = [];
  private listeners: ((e: { source: unknown; data: unknown; ports: PortLike[] }) => void)[] = [];

  postMessage(message: unknown): void {
    this.posted.push(message);
  }
  addEventListener(_type: "message", listener: (e: { source: unknown; data: unknown; ports: PortLike[] }) => void): void {
    this.listeners.push(listener);
  }
  removeEventListener(_type: "message", listener: (e: { source: unknown; data: unknown; ports: PortLike[] }) => void): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }
  respondWithPort(port: PortLike): void {
    for (const cb of this.listeners) cb({ source: this, data: "desktop-rt-port", ports: [port] });
  }
  emit(source: unknown, data: unknown, ports: PortLike[] = []): void {
    for (const cb of this.listeners) cb({ source, data, ports });
  }
}

describe("isDesktopRealtime", () => {
  it("is true when __DESKTOP_RT__ is set", () => {
    expect(isDesktopRealtime({ __DESKTOP_RT__: true })).toBe(true);
  });
  it("is false when absent or falsy", () => {
    expect(isDesktopRealtime({})).toBe(false);
    expect(isDesktopRealtime(undefined)).toBe(false);
  });
});

describe("PortTransport", () => {
  it("performs the desktop-rt-connect handshake and opens on a matching response", () => {
    const win = new FakeWindow();
    const transport = new PortTransport(win);
    expect(win.posted).toEqual(["desktop-rt-connect"]);
    expect(transport.readyState).toBe(READY_STATE.CONNECTING);

    const onopen = vi.fn();
    transport.onopen = onopen;
    const port = new FakePort();
    win.respondWithPort(port);

    expect(transport.readyState).toBe(READY_STATE.OPEN);
    expect(onopen).toHaveBeenCalledTimes(1);
    expect(port.started).toBe(true);
  });

  it("ignores messages from another source or with a different payload", () => {
    const win = new FakeWindow();
    const transport = new PortTransport(win);
    win.emit({}, "desktop-rt-port", [new FakePort()]);
    win.emit(win, "something-else", [new FakePort()]);
    expect(transport.readyState).toBe(READY_STATE.CONNECTING);
  });

  it("forwards envelope messages from the port through onmessage", () => {
    const win = new FakeWindow();
    const transport = new PortTransport(win);
    const port = new FakePort();
    win.respondWithPort(port);

    const received: string[] = [];
    transport.onmessage = (e) => received.push(e.data);
    port.emitMessage('{"key":"k1","payload":{"a":1}}');
    expect(received).toEqual(['{"key":"k1","payload":{"a":1}}']);
  });

  it("only sends once open, and routes send() through the port", () => {
    const win = new FakeWindow();
    const transport = new PortTransport(win);
    transport.send("too-early");
    expect(transport.readyState).toBe(READY_STATE.CONNECTING);

    const port = new FakePort();
    win.respondWithPort(port);
    transport.send("hello");
    expect(port.sent).toEqual(["hello"]);
  });

  it("fires onclose and flips to CLOSED when the port closes", () => {
    const win = new FakeWindow();
    const transport = new PortTransport(win);
    const port = new FakePort();
    win.respondWithPort(port);

    const onclose = vi.fn();
    transport.onclose = onclose;
    port.emitClose();

    expect(onclose).toHaveBeenCalledTimes(1);
    expect(transport.readyState).toBe(READY_STATE.CLOSED);
  });

  it("close() closes the underlying port and flips readyState", () => {
    const win = new FakeWindow();
    const transport = new PortTransport(win);
    const port = new FakePort();
    win.respondWithPort(port);

    transport.close();
    expect(port.closed).toBe(true);
    expect(transport.readyState).toBe(READY_STATE.CLOSED);
  });
});
