import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { listComments, onComment } from "../ai/comments.js";
import { subscribeChart } from "../realtime/charts.js";
import { subscribeQuotes } from "../realtime/quotes.js";
import { clampViewCount } from "../services/history.js";
import { easternDate } from "../services/session.js";
import { normalizeSymbol } from "./symbols.js";

const KEEPALIVE_MS = 15_000;

type Attach = (push: (envelope: string) => void) => (() => void) | Promise<() => void>;

async function sse(req: FastifyRequest, reply: FastifyReply, attach: Attach): Promise<void> {
  reply.hijack();
  const res = reply.raw;
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const write = (event: string, data: string) => {
    res.write(`event: ${event}\ndata: ${data}\n\n`);
  };
  const keepalive = setInterval(() => write("ping", String(Date.now())), KEEPALIVE_MS);
  let closed = false;
  let unsub: (() => void) | null = null;
  req.raw.on("close", () => {
    closed = true;
    clearInterval(keepalive);
    unsub?.();
    res.end();
  });
  unsub = await attach((envelope) => write("message", envelope));
  if (closed) unsub();
}

export const streamsRoute: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { extra?: string } }>("/quotes", (req, reply) => {
    const extra = (req.query.extra ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return sse(req, reply, (push) => subscribeQuotes(push, extra));
  });

  app.get<{ Params: { id: string }; Querystring: { count?: string } }>("/charts/:id", (req, reply) => {
    const count = clampViewCount(req.query.count) ?? undefined;
    return sse(req, reply, (push) => subscribeChart(req.params.id, push, count));
  });

  app.get<{ Params: { symbol: string } }>("/comments/:symbol", (req, reply) => {
    const symbol = normalizeSymbol(req.params.symbol);
    return sse(req, reply, async (push) => {
      const comments = await listComments(symbol, easternDate());
      push(JSON.stringify({ type: "init", comments }));
      return onComment(symbol, (comment) => push(JSON.stringify({ type: "comment", comment })));
    });
  });
};
