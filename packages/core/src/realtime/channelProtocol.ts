import { type AnnotationsChangedEvent, loadAnnotations, onAnnotationsChanged } from "../services/annotations.js";
import { clampViewCount } from "../services/history.js";
import type { ProChannel } from "@kansoku/pro-api";
import { normalizeSymbol } from "../services/symbol.utils.js";
import { getPro } from "../pro/registry.js";
import { coreAiChannels } from "./aiChannels.js";
import { subscribeAnalyses } from "./analyses.js";
import { subscribeBenchmark } from "./benchmark.js";
import { subscribeBoard } from "./board.js";
import { subscribeChart, subscribePreview } from "./charts.js";
import type { Connection } from "./connection.js";
import { subscribePosition } from "./position.js";
import { subscribeQuotes } from "./quotes.js";

const MAX_CHANNELS_PER_SOCKET = 16;

const STATIC_KINDS = [
  "quotes",
  "chart",
  "analyses",
  "position",
  "benchmark",
  "board",
  "preview",
  "annotations",
] as const;

export interface WsSub {
  op: "sub";
  key: string;
  kind: (typeof STATIC_KINDS)[number] | string;
  extra?: string[];
  id?: string;
  count?: number;
  symbol?: string;
  path?: string;
}

export interface WsUnsub {
  op: "unsub";
  key: string;
}

export type WsClientMessage = WsSub | WsUnsub;

function findChannel(kind: string): ProChannel | undefined {
  return [...coreAiChannels, ...(getPro()?.channels ?? [])].find((c) => c.kind === kind);
}

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
  if (msg.kind === "preview") {
    if (typeof msg.symbol !== "string" || !msg.symbol) return null;
    return { op: "sub", key: msg.key, kind: "preview", symbol: msg.symbol };
  }
  if (msg.kind === "board") {
    return { op: "sub", key: msg.key, kind: "board" };
  }
  if (msg.kind === "annotations") {
    if (typeof msg.symbol !== "string" || !msg.symbol) return null;
    return { op: "sub", key: msg.key, kind: "annotations", symbol: msg.symbol };
  }
  if (typeof msg.kind === "string") {
    const channel = findChannel(msg.kind);
    if (channel) {
      const parsed = channel.parse(msg);
      if (!parsed) return null;
      return { op: "sub", key: msg.key, kind: msg.kind, ...parsed };
    }
  }
  return null;
}

function pushAnnotationsUpdate(push: (envelope: string) => void, event: AnnotationsChangedEvent): void {
  push(
    JSON.stringify({
      type: "update",
      annotations: event.annotations,
      ...(event.clientId !== undefined ? { clientId: event.clientId } : {}),
    }),
  );
}

async function attachAnnotations(symbol: string, push: (envelope: string) => void): Promise<() => void> {
  const buffered: AnnotationsChangedEvent[] = [];
  let ready = false;
  const unsub = onAnnotationsChanged(symbol, (event) => {
    if (ready) pushAnnotationsUpdate(push, event);
    else buffered.push(event);
  });
  const annotations = await loadAnnotations(symbol);
  push(JSON.stringify({ type: "init", annotations }));
  ready = true;
  for (const event of buffered) pushAnnotationsUpdate(push, event);
  return unsub;
}

async function attachChannel(msg: WsSub, push: (envelope: string) => void): Promise<() => void> {
  if (msg.kind === "quotes") return subscribeQuotes(push, msg.extra ?? []);
  if (msg.kind === "chart") {
    const count = clampViewCount(msg.count != null ? String(msg.count) : undefined) ?? undefined;
    return subscribeChart(msg.id as string, push, count);
  }
  if (msg.kind === "analyses") return subscribeAnalyses(normalizeSymbol(msg.symbol as string), push);
  if (msg.kind === "position") return subscribePosition(normalizeSymbol(msg.symbol as string), push);
  if (msg.kind === "benchmark") return subscribeBenchmark(normalizeSymbol(msg.symbol as string), push);
  if (msg.kind === "preview") return subscribePreview(msg.symbol as string, push);
  if (msg.kind === "annotations") return attachAnnotations(msg.symbol as string, push);
  if (msg.kind === "board") return subscribeBoard(push);
  const channel = findChannel(msg.kind);
  if (channel) return channel.attach(msg as unknown as Record<string, unknown>, push);
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
