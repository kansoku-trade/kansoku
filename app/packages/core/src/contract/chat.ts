import type { ChatDisplayMessage } from "../ai/chat.js";
import type { ChatSession } from "../ai/chatStore.js";
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

export interface ChatApi {
  get(input: { id: string }): Promise<ChatState>;
  postMessage(input: { id: string; text: string }): Promise<PostMessageResult>;
}

export const chatRoutes = defineRoutes<ChatApi>("charts", {
  get: { method: "GET", path: "/:id/chat", raw: "body" },
  postMessage: { method: "POST", path: "/:id/chat/messages", raw: "statusBody" },
});
