export const READY_STATE = { CONNECTING: 0, OPEN: 1, CLOSED: 3 } as const;

export interface SocketLike {
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  send(data: string): void;
  close(): void;
}

export interface PortLike {
  postMessage(data: string): void;
  close(): void;
  start?: () => void;
  addEventListener(type: "message", listener: (e: { data: unknown }) => void): void;
  addEventListener(type: "close", listener: () => void): void;
}

export interface WindowLike {
  postMessage(message: unknown, targetOrigin: string): void;
  addEventListener(type: "message", listener: (e: { source: unknown; data: unknown; ports: PortLike[] }) => void): void;
  removeEventListener(type: "message", listener: (e: { source: unknown; data: unknown; ports: PortLike[] }) => void): void;
}

export function isDesktopRealtime(win: unknown = typeof window === "undefined" ? undefined : window): boolean {
  return (win as { __DESKTOP_RT__?: boolean } | undefined)?.__DESKTOP_RT__ === true;
}

export class PortTransport implements SocketLike {
  readyState: number = READY_STATE.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  private port: PortLike | null = null;
  private win: WindowLike;

  constructor(win: WindowLike = window as unknown as WindowLike) {
    this.win = win;
    this.handshake();
  }

  private handshake(): void {
    const onMessage = (event: { source: unknown; data: unknown; ports: PortLike[] }) => {
      if (event.source !== this.win || event.data !== "desktop-rt-port") return;
      this.win.removeEventListener("message", onMessage);
      const port = event.ports[0];
      if (!port) {
        this.onerror?.();
        return;
      }
      this.bindPort(port);
    };
    this.win.addEventListener("message", onMessage);
    this.win.postMessage("desktop-rt-connect", "*");
  }

  private bindPort(port: PortLike): void {
    this.port = port;
    port.addEventListener("message", (e) => this.onmessage?.({ data: String(e.data) }));
    port.addEventListener("close", () => {
      this.readyState = READY_STATE.CLOSED;
      this.port = null;
      this.onclose?.();
    });
    port.start?.();
    this.readyState = READY_STATE.OPEN;
    this.onopen?.();
  }

  send(data: string): void {
    if (this.readyState === READY_STATE.OPEN) this.port?.postMessage(data);
  }

  close(): void {
    this.readyState = READY_STATE.CLOSED;
    this.port?.close();
    this.port = null;
  }
}
