import { isDesktopRealtime, PortTransport, type SocketLike } from "./portTransport.js";

export type ChannelSpec =
  | { kind: "quotes"; extra?: string[] }
  | { kind: "chart"; id: string; count?: number }
  | { kind: "comments"; symbol: string }
  | { kind: "analyses"; symbol: string }
  | { kind: "position"; symbol: string }
  | { kind: "benchmark"; symbol: string }
  | { kind: "preview"; symbol: string }
  | { kind: "board" }
  | { kind: "chat"; id: string };

interface ChannelSub {
  spec: ChannelSpec;
  onPayload: (payload: unknown) => void;
  onConnected: (connected: boolean) => void;
}

const RECONNECT_MS = 2_000;

let ws: SocketLike | null = null;
let manualClose = false;
let reconnectTimer: number | null = null;
let nextKey = 0;
const subs = new Map<string, ChannelSub>();

function wsUrl(): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/api/ws`;
}

function broadcast(connected: boolean): void {
  for (const sub of subs.values()) sub.onConnected(connected);
}

function connect(): void {
  if (ws || subs.size === 0) return;
  const sock = (isDesktopRealtime() ? new PortTransport() : new WebSocket(wsUrl())) as unknown as SocketLike;
  ws = sock;
  sock.onopen = () => {
    for (const [key, sub] of subs) sock.send(JSON.stringify({ op: "sub", key, ...sub.spec }));
    broadcast(true);
  };
  sock.onmessage = (e) => {
    let msg: { key: string; payload: unknown };
    try {
      msg = JSON.parse(e.data as string) as { key: string; payload: unknown };
    } catch {
      return;
    }
    subs.get(msg.key)?.onPayload(msg.payload);
  };
  sock.onclose = () => {
    if (ws === sock) ws = null;
    broadcast(false);
    if (!manualClose && subs.size > 0) scheduleReconnect();
    manualClose = false;
  };
  sock.onerror = () => sock.close();
}

function scheduleReconnect(): void {
  if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, RECONNECT_MS);
}

export function subscribeChannel(
  spec: ChannelSpec,
  onPayload: (payload: unknown) => void,
  onConnected: (connected: boolean) => void,
): () => void {
  const key = `c${nextKey++}`;
  subs.set(key, { spec, onPayload, onConnected });
  if (!ws) {
    connect();
  } else if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ op: "sub", key, ...spec }));
    onConnected(true);
  }
  return () => {
    subs.delete(key);
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: "unsub", key }));
    if (subs.size === 0 && ws) {
      manualClose = true;
      ws.close();
      ws = null;
    }
  };
}
