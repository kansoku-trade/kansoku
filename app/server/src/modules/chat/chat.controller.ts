import { Body, Controller, Get, Param, Post } from "@tsuki-hono/common";
import type { ChartDoc } from "../../../../shared/types.js";
import { type ChatDeps, chatTurnState, runChatTurn, toDisplayMessages } from "../../ai/chat.js";
import { getSessionByChartId, listMessages } from "../../ai/chatStore.js";
import { aiConfig } from "../../ai/models.js";
import { ClientError } from "../../errors.js";
import { loadChart } from "../../services/store.js";

const MAX_TEXT_LENGTH = 4000;

function isIntradayChart(doc: ChartDoc): boolean {
  return doc.built.kind === "intraday" && !!doc.symbol;
}

let testDeps: ChatDeps | null = null;

export function setChatDepsForTests(deps: ChatDeps | null): void {
  testDeps = deps;
}

function buildDeps(): ChatDeps {
  return testDeps ?? { model: aiConfig().chatModel };
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

@Controller("charts")
export class ChatController {
  @Get("/:id/chat")
  async getChat(@Param("id") id: string) {
    const doc = await loadChart(id);
    if (!doc || !isIntradayChart(doc)) {
      throw new ClientError(`chart not found: ${id}`, "GET /api/charts lists available ids", 404);
    }
    const session = await getSessionByChartId(id);
    const messages = session ? toDisplayMessages(await listMessages(session.id)) : [];
    const { busy, partial } = chatTurnState(id);
    return { session, messages, busy, partial };
  }

  @Post("/:id/chat/messages")
  async postMessage(@Param("id") id: string, @Body() body: { text?: unknown } | null) {
    const text = body?.text;
    if (typeof text !== "string" || !text.trim() || text.length > MAX_TEXT_LENGTH) {
      throw new ClientError("`text` must be a non-empty string of at most 4000 characters", 'e.g. {"text": "..."}');
    }

    const result = await runChatTurn(id, text, buildDeps());
    if (result.started) {
      result.done.catch((err) => console.error("chat: turn failed", err));
      return jsonResponse(202, { accepted: true });
    }
    if (result.reason === "busy") {
      return jsonResponse(409, { error: "上一条还在回答中" });
    }
    if (result.reason === "no_model") {
      return jsonResponse(503, { error: "未配置追问模型，请在 /settings 配置" });
    }
    throw new ClientError(`chart not found: ${id}`, "GET /api/charts lists available ids", 404);
  }
}
