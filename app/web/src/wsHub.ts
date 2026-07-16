import { isDesktopRealtime, PortTransport, type SocketLike } from "./portTransport.js";

export type ChannelSpec =
  | { kind: "quotes"; extra?: string[] }
  | { kind: "chart"; id: string; count?: number }
  | { kind: "comments"; symbol: string }
  | { kind: "notifications" }
  | { kind: "analyses"; symbol: string }
  | { kind: "position"; symbol: string }
  | { kind: "benchmark"; symbol: string }
  | { kind: "preview"; symbol: string }
  | { kind: "board" }
  | { kind: "chat"; id: string }
  | { kind: "research-chat"; path: string }
  | { kind: "assistant-chat"; id: string }
  | { kind: "research-refresh"; path: string }
  | { kind: "annotations"; symbol: string }
  | { kind: "analyst-runs" };

interface ChannelSub {
  spec: ChannelSpec;
  onPayload: (payload: unknown) => void;
  onConnected: (connected: boolean) => void;
}

const RECONNECT_MS = 2_000;

export type HubStatus = "connecting" | "connected" | "reconnecting";

let ws: SocketLike | null = null;
let reconnectTimer: number | null = null;
let nextKey = 0;
const subs = new Map<string, ChannelSub>();

let hubStatus: HubStatus = "connecting";
const statusListeners = new Set<() => void>();

function setHubStatus(next: HubStatus): void {
  if (hubStatus === next) return;
  hubStatus = next;
  for (const listener of statusListeners) listener();
}

export function getHubStatus(): HubStatus {
  return hubStatus;
}

export function subscribeHubStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

function wsUrl(): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/api/ws`;
}

function broadcast(connected: boolean): void {
  for (const sub of subs.values()) sub.onConnected(connected);
}

function cancelReconnect(): void {
  if (reconnectTimer === null) return;
  window.clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function closeCurrentSocket(): void {
  const sock = ws;
  if (!sock) return;
  ws = null;
  sock.onopen = null;
  sock.onmessage = null;
  sock.onclose = null;
  sock.onerror = null;
  sock.close();
}

function connect(): void {
  if (ws || subs.size === 0) return;
  cancelReconnect();
  const sock = (isDesktopRealtime() ? new PortTransport() : new WebSocket(wsUrl())) as unknown as SocketLike;
  ws = sock;
  setHubStatus(hubStatus === "reconnecting" ? "reconnecting" : "connecting");
  sock.onopen = () => {
    if (ws !== sock) return;
    for (const [key, sub] of subs) sock.send(JSON.stringify({ op: "sub", key, ...sub.spec }));
    setHubStatus("connected");
    broadcast(true);
  };
  sock.onmessage = (e) => {
    if (ws !== sock) return;
    let msg: { key: string; payload: unknown };
    try {
      msg = JSON.parse(e.data as string) as { key: string; payload: unknown };
    } catch {
      return;
    }
    subs.get(msg.key)?.onPayload(msg.payload);
  };
  sock.onclose = () => {
    if (ws !== sock) return;
    ws = null;
    broadcast(false);
    if (subs.size > 0) {
      setHubStatus("reconnecting");
      scheduleReconnect();
    } else {
      setHubStatus("connecting");
    }
  };
  sock.onerror = () => {
    if (ws === sock) sock.close();
  };
}

function scheduleReconnect(): void {
  cancelReconnect();
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
    if (subs.size === 0) {
      cancelReconnect();
      setHubStatus("connecting");
      closeCurrentSocket();
    }
  };
}
