import { Body, Controller, Delete, Get, Param, Post } from "@tsuki-hono/common";
import { ClientError } from "@kansoku/core/errors";
import { assistantChatService } from "@kansoku/core/modules/assistant/assistantChat.service";
import { jsonResponse } from "../../httpResponse.js";

function requireText(body: { text?: unknown } | null): string {
  if (typeof body?.text !== "string") {
    throw new ClientError("`text` must be a non-empty string of at most 4000 characters", '{"text":"..."}');
  }
  return body.text;
}

function requireTitle(body: { title?: unknown } | null): string | undefined {
  if (body?.title !== undefined && typeof body.title !== "string") {
    throw new ClientError("`title` must be a string");
  }
  return body?.title as string | undefined;
}

@Controller("assistant")
export class AssistantController {
  @Get("/sessions")
  async listSessions() {
    return assistantChatService.listSessions();
  }

  @Post("/sessions")
  async createSession(@Body() body: { title?: unknown } | null) {
    return assistantChatService.createSession({ title: requireTitle(body) });
  }

  @Delete("/sessions/:id")
  async deleteSession(@Param("id") id: string) {
    return assistantChatService.deleteSession({ id });
  }

  @Get("/sessions/:id/chat")
  async getChat(@Param("id") id: string) {
    return assistantChatService.getChat({ id });
  }

  @Post("/sessions/:id/chat/messages")
  async postMessage(@Param("id") id: string, @Body() body: { text?: unknown } | null) {
    const result = await assistantChatService.postMessage({ id, text: requireText(body) });
    return jsonResponse(result.status, result.body);
  }

  @Post("/sessions/:id/chat/abort")
  async abortChat(@Param("id") id: string) {
    return assistantChatService.abortChat({ id });
  }
}
