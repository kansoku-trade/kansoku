import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Db } from "../db/index.js";
import { chatSessions } from "../db/schema.js";
import { nextSnowflake } from "../db/snowflake.js";
import { type ConversationMessageRow, createConversationStore, titleFromText } from "./conversationStore.js";

export interface ChatSession {
  id: string;
  chartId: string;
  symbol: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export type ChatMessageRow = ConversationMessageRow;

export { titleFromText };

const store = createConversationStore<ChatSession, { chartId: string; symbol: string; title: string }>({
  sessionTable: chatSessions,
  idColumn: chatSessions.id,
  keyColumn: chatSessions.chartId,
  buildSession: (input, now) => ({
    id: nextSnowflake(),
    chartId: input.chartId,
    symbol: input.symbol,
    title: input.title,
    createdAt: now,
    updatedAt: now,
  }),
});

export function getSessionByChartId(chartId: string, db?: Db): Promise<ChatSession | null> {
  return store.getSessionByKey(chartId, db);
}

export function createSession(
  input: { chartId: string; symbol: string; title: string },
  db?: Db,
): Promise<ChatSession> {
  return store.createSession(input, db);
}

export function listMessages(sessionId: string, db?: Db): Promise<ChatMessageRow[]> {
  return store.listMessages(sessionId, db);
}

export function appendMessages(sessionId: string, messages: AgentMessage[], db?: Db): Promise<void> {
  return store.appendMessages(sessionId, messages, db);
}
