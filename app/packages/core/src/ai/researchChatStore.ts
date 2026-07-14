import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ResearchChatSession } from "../contract/research.js";
import type { Db } from "../db/index.js";
import { researchChatSessions } from "../db/schema.js";
import { nextSnowflake } from "../db/snowflake.js";
import { type ConversationMessageRow, createConversationStore } from "./conversationStore.js";

export type ResearchChatMessageRow = ConversationMessageRow;

const store = createConversationStore<ResearchChatSession, { path: string; title: string }>({
  sessionTable: researchChatSessions,
  idColumn: researchChatSessions.id,
  keyColumn: researchChatSessions.path,
  buildSession: (input, now) => ({
    id: nextSnowflake(),
    path: input.path,
    title: input.title,
    createdAt: now,
    updatedAt: now,
  }),
});

export function getResearchSessionByPath(path: string, db?: Db): Promise<ResearchChatSession | null> {
  return store.getSessionByKey(path, db);
}

export function createResearchSession(
  input: { path: string; title: string },
  db?: Db,
): Promise<ResearchChatSession> {
  return store.createSession(input, db);
}

export function listResearchMessages(sessionId: string, db?: Db): Promise<ResearchChatMessageRow[]> {
  return store.listMessages(sessionId, db);
}

export function appendResearchMessages(sessionId: string, messages: AgentMessage[], db?: Db): Promise<void> {
  return store.appendMessages(sessionId, messages, db);
}
