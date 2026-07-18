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

type HandshakeListener = (event: { source: unknown; data: unknown; ports: PortLike[] }) => void;

export function isDesktopRealtime(win: unknown = typeof window === "undefined" ? undefined : window): boolean {
  return (win as { __DESKTOP_RT__?: boolean } | undefined)?.__DESKTOP_RT__ === true;
}

const DEFAULT_HANDSHAKE_TIMEOUT_MS = 5_000;

export class PortTransport implements SocketLike {
  readyState: number = READY_STATE.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  private port: PortLike | null = null;
  private win: WindowLike;
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null;
  private handshakeListener: HandshakeListener | null = null;

  constructor(win: WindowLike = window as unknown as WindowLike, handshakeTimeoutMs = DEFAULT_HANDSHAKE_TIMEOUT_MS) {
    this.win = win;
    this.handshake(handshakeTimeoutMs);
  }

  private handshake(timeoutMs: number): void {
    const onMessage: HandshakeListener = (event) => {
      if (event.source !== this.win || event.data !== "desktop-rt-port") return;
      this.cancelHandshake();
      const port = event.ports[0];
      if (!port) {
        this.onerror?.();
        this.transitionToClosed();
        return;
      }
      this.bindPort(port);
    };
    this.handshakeListener = onMessage;
    this.win.addEventListener("message", onMessage);
    // The main-process handshake reply is a same-process IPC round trip that
    // should resolve near-instantly; if it never arrives, fail into the
    // reconnect path instead of leaving callers awaiting onopen forever.
    this.handshakeTimer = setTimeout(() => {
      this.handshakeTimer = null;
      this.clearHandshakeListener();
      this.onerror?.();
      this.transitionToClosed();
    }, timeoutMs);
    this.win.postMessage("desktop-rt-connect", "*");
  }

  private clearHandshakeListener(): void {
    if (!this.handshakeListener) return;
    this.win.removeEventListener("message", this.handshakeListener);
    this.handshakeListener = null;
  }

  private clearHandshakeTimer(): void {
    if (this.handshakeTimer === null) return;
    clearTimeout(this.handshakeTimer);
    this.handshakeTimer = null;
  }

  private cancelHandshake(): void {
    this.clearHandshakeListener();
    this.clearHandshakeTimer();
  }

  private bindPort(port: PortLike): void {
    if (this.readyState !== READY_STATE.CONNECTING) {
      port.close();
      return;
    }
    this.port = port;
    port.addEventListener("message", (e) => this.onmessage?.({ data: String(e.data) }));
    port.addEventListener("close", () => this.transitionToClosed());
    port.start?.();
    this.readyState = READY_STATE.OPEN;
    this.onopen?.();
  }

  private transitionToClosed(): void {
    if (this.readyState === READY_STATE.CLOSED) return;
    this.cancelHandshake();
    this.readyState = READY_STATE.CLOSED;
    this.port = null;
    this.onclose?.();
  }

  send(data: string): void {
    if (this.readyState === READY_STATE.OPEN) this.port?.postMessage(data);
  }

  close(): void {
    // A MessagePort's close event only fires on the entangled peer, never on
    // the end that called close() itself, so this end must self-report.
    const port = this.port;
    this.transitionToClosed();
    port?.close();
  }
}
