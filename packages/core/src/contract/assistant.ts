import type { ChatDisplayMessage } from "@kansoku/pro-api";
import { defineRoutes } from "./defineRoutes.js";

export interface AssistantSessionMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssistantChatUsage {
  totalTokens: number;
  costTotal: number;
  calls: number;
}

export interface AssistantChatState {
  session: AssistantSessionMeta | null;
  messages: ChatDisplayMessage[];
  busy: boolean;
  partial: string | null;
  usage: AssistantChatUsage;
}

export type AssistantPostMessageResult =
  | { status: 202; body: { accepted: true } }
  | { status: 409; body: { error: string } }
  | { status: 404; body: { error: string } }
  | { status: 503; body: { error: string } };

export interface AssistantApi {
  listSessions(): Promise<{ sessions: AssistantSessionMeta[] }>;
  createSession(input: { title?: string }): Promise<{ session: AssistantSessionMeta }>;
  deleteSession(input: { id: string }): Promise<{ ok: true }>;
  getChat(input: { id: string }): Promise<AssistantChatState>;
  postMessage(input: { id: string; text: string }): Promise<AssistantPostMessageResult>;
  abortChat(input: { id: string }): Promise<{ ok: boolean }>;
}

export const assistantRoutes = defineRoutes<AssistantApi>("assistant", {
  listSessions: { method: "GET", path: "/sessions" },
  createSession: { method: "POST", path: "/sessions" },
  deleteSession: { method: "DELETE", path: "/sessions/:id" },
  getChat: { method: "GET", path: "/sessions/:id/chat", raw: "body" },
  postMessage: { method: "POST", path: "/sessions/:id/chat/messages", raw: "statusBody" },
  abortChat: { method: "POST", path: "/sessions/:id/chat/abort" },
});
