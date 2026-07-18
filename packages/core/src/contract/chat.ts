import type { ChatDisplayMessage, ChatSession } from "@kansoku/pro-api";
import { defineRoutes } from "./defineRoutes.js";

export interface ChatState {
  session: ChatSession | null;
  messages: ChatDisplayMessage[];
  busy: boolean;
  partial: string | null;
}

export type PostMessageResult =
  | { status: 202; body: { accepted: true } }
  | { status: 409; body: { error: string } }
  | { status: 503; body: { error: string } };

export type AbortResult = { status: 202; body: { aborted: true } } | { status: 409; body: { error: string } };

export interface ChatSuggestions {
  suggestions: string[];
}

export interface ChatApi {
  get(input: { id: string }): Promise<ChatState>;
  postMessage(input: { id: string; text: string }): Promise<PostMessageResult>;
  abort(input: { id: string }): Promise<AbortResult>;
  suggestions(input: { id: string }): Promise<ChatSuggestions>;
}

export const chatRoutes = defineRoutes<ChatApi>("charts", {
  get: { method: "GET", path: "/:id/chat", raw: "body" },
  postMessage: { method: "POST", path: "/:id/chat/messages", raw: "statusBody" },
  abort: { method: "POST", path: "/:id/chat/abort", raw: "statusBody" },
  suggestions: { method: "GET", path: "/:id/chat/suggestions", raw: "body" },
});
