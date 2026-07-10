import type { CockpitComment } from "../../../shared/types.js";
import { chatTurnState, onChatEvent } from "../ai/chat.js";
import { listComments, onComment } from "../ai/comments.js";
import { acquireLease, releaseLease } from "../ai/leases.js";
import { onNotice } from "../ai/notices.js";
import { clampViewCount } from "../services/history.js";
import { easternDate } from "../services/session.js";
import { normalizeSymbol } from "../services/symbol.utils.js";
import { subscribeAnalyses } from "./analyses.js";
import { subscribeBenchmark } from "./benchmark.js";
import { subscribeBoard } from "./board.js";
import { subscribeChart } from "./charts.js";
import type { Connection } from "./connection.js";
import { subscribePosition } from "./position.js";
import { subscribeQuotes } from "./quotes.js";

async function attachComments(symbol: string, push: (envelope: string) => void): Promise<() => void> {
  const buffered: CockpitComment[] = [];
  let ready = false;
  const unsubComment = onComment(symbol, (comment) => {
    if (ready) push(JSON.stringify({ type: "comment", comment }));
    else buffered.push(comment);
  });
  const unsubNotice = onNotice(symbol, (notice) => push(JSON.stringify({ type: "notice", notice })));
  const comments = await listComments(symbol, easternDate());
  push(JSON.stringify({ type: "init", comments }));
  const seen = new Set(comments.map((c) => `${c.ts} ${c.text}`));
  for (const comment of buffered) {
    if (seen.has(`${comment.ts} ${comment.text}`)) continue;
    push(JSON.stringify({ type: "comment", comment }));
  }
  ready = true;
  return () => {
    unsubComment();
    unsubNotice();
  };
}

const MAX_CHANNELS_PER_SOCKET = 16;

export interface WsSub {
  op: "sub";
  key: string;
  kind: "quotes" | "chart" | "comments" | "analyses" | "position" | "benchmark" | "board" | "chat";
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
  if (msg.kind === "analyses") {
    if (typeof msg.symbol !== "string" || !msg.symbol) return null;
    return { op: "sub", key: msg.key, kind: "analyses", symbol: msg.symbol };
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
  if (msg.kind === "chat") {
    if (typeof msg.id !== "string" || !msg.id) return null;
    return { op: "sub", key: msg.key, kind: "chat", id: msg.id };
  }
  return null;
}

function attachChat(chartId: string, push: (envelope: string) => void): () => void {
  const unsub = onChatEvent(chartId, (event) => push(JSON.stringify({ type: "event", event })));
  const { busy, partial } = chatTurnState(chartId);
  push(JSON.stringify({ type: "init", busy, partial }));
  return unsub;
}

async function attachChannel(msg: WsSub, push: (envelope: string) => void): Promise<() => void> {
  if (msg.kind === "quotes") return subscribeQuotes(push, msg.extra ?? []);
  if (msg.kind === "chart") {
    const count = clampViewCount(msg.count != null ? String(msg.count) : undefined) ?? undefined;
    return subscribeChart(msg.id as string, push, count);
  }
  if (msg.kind === "comments") {
    const symbol = normalizeSymbol(msg.symbol as string);
    const unsub = await attachComments(symbol, push);
    acquireLease(symbol);
    let released = false;
    return () => {
      if (!released) {
        released = true;
        releaseLease(symbol);
      }
      unsub();
    };
  }
  if (msg.kind === "analyses") return subscribeAnalyses(normalizeSymbol(msg.symbol as string), push);
  if (msg.kind === "position") return subscribePosition(normalizeSymbol(msg.symbol as string), push);
  if (msg.kind === "benchmark") return subscribeBenchmark(normalizeSymbol(msg.symbol as string), push);
  if (msg.kind === "chat") return attachChat(msg.id as string, push);
  return subscribeBoard(push);
}

export function handleConnection(conn: Connection): void {
  const subs = new Map<string, () => void>();
  let closed = false;

  const send = (key: string, envelope: string) => {
    if (!closed) conn.send(`{"key":${JSON.stringify(key)},"payload":${envelope}}`);
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

  conn.onMessage((raw) => {
    void handle(raw);
  });
  conn.onClose(() => {
    closed = true;
    for (const unsub of subs.values()) unsub();
    subs.clear();
  });
}
