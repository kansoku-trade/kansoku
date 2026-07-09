import type { FastifyPluginAsync } from "fastify";
import type { ChartDoc } from "../../../shared/types.js";
import { type ChatDeps, chatTurnState, runChatTurn, toDisplayMessages } from "../ai/chat.js";
import { getSessionByChartId, listMessages } from "../ai/chatStore.js";
import { aiConfig } from "../ai/models.js";
import { ClientError } from "../errors.js";
import { loadChart } from "../services/store.js";

type Params = { id: string };

const MAX_TEXT_LENGTH = 4000;

function isIntradayChart(doc: ChartDoc): boolean {
  return doc.built.kind === "intraday" && !!doc.symbol;
}

export interface ChatRouteOptions {
  deps?: ChatDeps;
}

export const chatRoute: FastifyPluginAsync<ChatRouteOptions> = async (app, opts) => {
  const buildDeps = (): ChatDeps => opts.deps ?? { model: aiConfig().chatModel };

  app.get<{ Params: Params }>("/:id/chat", async (req) => {
    const id = req.params.id;
    const doc = await loadChart(id);
    if (!doc || !isIntradayChart(doc)) {
      throw new ClientError(`chart not found: ${id}`, "GET /api/charts lists available ids", 404);
    }
    const session = await getSessionByChartId(id);
    const messages = session ? toDisplayMessages(await listMessages(session.id)) : [];
    const { busy, partial } = chatTurnState(id);
    return { session, messages, busy, partial };
  });

  app.post<{ Params: Params; Body: { text?: unknown } }>("/:id/chat/messages", async (req, reply) => {
    const id = req.params.id;
    const text = req.body?.text;
    if (typeof text !== "string" || !text.trim() || text.length > MAX_TEXT_LENGTH) {
      throw new ClientError(
        "`text` must be a non-empty string of at most 4000 characters",
        'e.g. {"text": "..."}',
      );
    }

    const result = await runChatTurn(id, text, buildDeps());
    if (result.started) {
      result.done.catch(() => {});
      return reply.status(202).send({ accepted: true });
    }
    if (result.reason === "busy") {
      return reply.status(409).send({ error: "上一条还在回答中" });
    }
    if (result.reason === "no_model") {
      return reply.status(503).send({ error: "未配置 AI_CHAT_MODEL / AI_ANALYST_MODEL" });
    }
    throw new ClientError(`chart not found: ${id}`, "GET /api/charts lists available ids", 404);
  });
};
