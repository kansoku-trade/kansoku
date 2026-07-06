import websocket from "@fastify/websocket";
import type { FastifyPluginAsync } from "fastify";
import type { WebSocket } from "ws";
import type { CockpitComment } from "../../../shared/types.js";
import { listComments, onComment } from "../ai/comments.js";
import { subscribeBenchmark } from "../realtime/benchmark.js";
import { subscribeBoard } from "../realtime/board.js";
import { subscribeChart } from "../realtime/charts.js";
import { subscribePosition } from "../realtime/position.js";
import { subscribeQuotes } from "../realtime/quotes.js";
import { clampViewCount } from "../services/history.js";
import { easternDate } from "../services/session.js";
import { normalizeSymbol } from "./symbols.js";

async function attachComments(symbol: string, push: (envelope: string) => void): Promise<() => void> {
  const buffered: CockpitComment[] = [];
  let ready = false;
  const unsub = onComment(symbol, (comment) => {
    if (ready) push(JSON.stringify({ type: "comment", comment }));
    else buffered.push(comment);
  });
  const comments = await listComments(symbol, easternDate());
  push(JSON.stringify({ type: "init", comments }));
  const seen = new Set(comments.map((c) => `${c.ts} ${c.text}`));
  for (const comment of buffered) {
    if (seen.has(`${comment.ts} ${comment.text}`)) continue;
    push(JSON.stringify({ type: "comment", comment }));
  }
  ready = true;
  return unsub;
}

const MAX_CHANNELS_PER_SOCKET = 16;
const PING_MS = 15_000;

export interface WsSub {
  op: "sub";
  key: string;
  kind: "quotes" | "chart" | "comments" | "position" | "benchmark" | "board";
  extra?: string[];
  id?: string;
  count?: number;
  symbol?: string;
}

export interface WsUnsub {
  op: "unsub";
  key: string;
}

export type WsClientMessage = WsSub | WsUnsub;

export function parseWsMessage(raw: unknown): WsClientMessage | null {
  if (typeof raw !== "object" || raw === null) return null;
  const msg = raw as Record<string, unknown>;
  if (typeof msg.key !== "string" || !msg.key || msg.key.length > 200) return null;
  if (msg.op === "unsub") return { op: "unsub", key: msg.key };
  if (msg.op !== "sub") return null;
  if (msg.kind === "quotes") {
    const extra = Array.isArray(msg.extra) ? msg.extra.filter((s): s is string => typeof s === "string") : [];
    return { op: "sub", key: msg.key, kind: "quotes", extra };
  }
  if (msg.kind === "chart") {
    if (typeof msg.id !== "string" || !msg.id) return null;
    const count = typeof msg.count === "number" && Number.isFinite(msg.count) ? msg.count : undefined;
    return { op: "sub", key: msg.key, kind: "chart", id: msg.id, count };
  }
  if (msg.kind === "comments") {
    if (typeof msg.symbol !== "string" || !msg.symbol) return null;
    return { op: "sub", key: msg.key, kind: "comments", symbol: msg.symbol };
  }
  if (msg.kind === "position") {
    if (typeof msg.symbol !== "string" || !msg.symbol) return null;
    return { op: "sub", key: msg.key, kind: "position", symbol: msg.symbol };
  }
  if (msg.kind === "benchmark") {
    if (typeof msg.symbol !== "string" || !msg.symbol) return null;
    return { op: "sub", key: msg.key, kind: "benchmark", symbol: msg.symbol };
  }
  if (msg.kind === "board") {
    return { op: "sub", key: msg.key, kind: "board" };
  }
  return null;
}

async function attachChannel(msg: WsSub, push: (envelope: string) => void): Promise<() => void> {
  if (msg.kind === "quotes") return subscribeQuotes(push, msg.extra ?? []);
  if (msg.kind === "chart") {
    const count = clampViewCount(msg.count != null ? String(msg.count) : undefined) ?? undefined;
    return subscribeChart(msg.id as string, push, count);
  }
  if (msg.kind === "position") return subscribePosition(normalizeSymbol(msg.symbol as string), push);
  if (msg.kind === "benchmark") return subscribeBenchmark(normalizeSymbol(msg.symbol as string), push);
  if (msg.kind === "board") return subscribeBoard(push);
  return attachComments(normalizeSymbol(msg.symbol as string), push);
}

function handleSocket(socket: WebSocket): void {
  const subs = new Map<string, () => void>();
  let closed = false;

  const ping = setInterval(() => {
    if (socket.readyState === socket.OPEN) socket.ping();
  }, PING_MS);

  const send = (key: string, envelope: string) => {
    if (!closed && socket.readyState === socket.OPEN) {
      socket.send(`{"key":${JSON.stringify(key)},"payload":${envelope}}`);
    }
  };

  const handle = async (raw: string) => {
    let msg: WsClientMessage | null;
    try {
      msg = parseWsMessage(JSON.parse(raw));
    } catch {
      return;
    }
    if (!msg || closed) return;
    if (msg.op === "unsub") {
      subs.get(msg.key)?.();
      subs.delete(msg.key);
      return;
    }
    if (subs.has(msg.key) || subs.size >= MAX_CHANNELS_PER_SOCKET) return;
    subs.set(msg.key, () => {});
    try {
      const unsub = await attachChannel(msg, (envelope) => send(msg.key, envelope));
      if (closed || !subs.has(msg.key)) {
        unsub();
        return;
      }
      subs.set(msg.key, unsub);
    } catch (err) {
      subs.delete(msg.key);
      send(msg.key, JSON.stringify({ type: "status", degraded: true, error: err instanceof Error ? err.message : String(err) }));
    }
  };

  socket.on("message", (buf) => {
    void handle(String(buf));
  });
  socket.on("close", () => {
    closed = true;
    clearInterval(ping);
    for (const unsub of subs.values()) unsub();
    subs.clear();
  });
  socket.on("error", () => socket.close());
}

export const wsRoute: FastifyPluginAsync = async (app) => {
  await app.register(websocket);
  app.get("/", { websocket: true }, (socket) => handleSocket(socket));
};
