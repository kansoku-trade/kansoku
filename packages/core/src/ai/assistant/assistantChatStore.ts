import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { desc, eq } from 'drizzle-orm';
import { getDb, type Db } from '../../db/index.js';
import { assistantSessions, chatMessages } from '../../db/schema.js';
import { nextSnowflake } from '../../db/snowflake.js';
import {
  type ConversationMessageRow,
  type ConversationSessionBase,
  createConversationStore,
} from '../conversation/conversationStore.js';
import { isUsage } from '../runtime/usage.js';
import { DEFAULT_ASSISTANT_TITLE, shouldAssignGeneratedTitle } from './sessionTitle.js';

export type AssistantSession = ConversationSessionBase;
export type AssistantMessageRow = ConversationMessageRow;

const store = createConversationStore<AssistantSession, { title: string }>({
  sessionTable: assistantSessions,
  idColumn: assistantSessions.id,
  keyColumn: assistantSessions.id,
  buildSession: (input, now) => ({
    id: nextSnowflake(),
    title: input.title,
    createdAt: now,
    updatedAt: now,
  }),
});

export function getAssistantSession(id: string, db?: Db): Promise<AssistantSession | null> {
  return store.getSessionByKey(id, db);
}

export function createAssistantSession(
  input: { title: string },
  db?: Db,
): Promise<AssistantSession> {
  return store.createSession(input, db);
}

export async function updateAssistantSessionTitle(
  id: string,
  title: string,
  db: Db = getDb(),
): Promise<AssistantSession | null> {
  const session = await getAssistantSession(id, db);
  if (!session) return null;
  const now = new Date().toISOString();
  db.update(assistantSessions)
    .set({ title, updatedAt: now })
    .where(eq(assistantSessions.id, id))
    .run();
  return { ...session, title, updatedAt: now };
}

export async function assignGeneratedAssistantTitle(
  id: string,
  title: string,
  db: Db = getDb(),
): Promise<AssistantSession | null> {
  const session = await getAssistantSession(id, db);
  if (!session) return null;
  if (!shouldAssignGeneratedTitle(session.title)) return session;
  return updateAssistantSessionTitle(id, title, db);
}

export { DEFAULT_ASSISTANT_TITLE };

export function listAssistantMessages(sessionId: string, db?: Db): Promise<AssistantMessageRow[]> {
  return store.listMessages(sessionId, db);
}

export function appendAssistantMessages(
  sessionId: string,
  messages: AgentMessage[],
  db?: Db,
): Promise<void> {
  return store.appendMessages(sessionId, messages, db);
}

export function listAssistantSessions(db: Db = getDb()): Promise<AssistantSession[]> {
  return db.select().from(assistantSessions).orderBy(desc(assistantSessions.updatedAt));
}

export async function deleteAssistantSession(id: string, db: Db = getDb()): Promise<void> {
  db.transaction((tx) => {
    tx.delete(chatMessages).where(eq(chatMessages.sessionId, id)).run();
    tx.delete(assistantSessions).where(eq(assistantSessions.id, id)).run();
  });
}

export interface AssistantSessionUsageTotal {
  totalTokens: number;
  costTotal: number;
  calls: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export async function sumAssistantSessionUsage(
  sessionId: string,
  db?: Db,
): Promise<AssistantSessionUsageTotal> {
  const rows = await listAssistantMessages(sessionId, db);
  const total: AssistantSessionUsageTotal = {
    totalTokens: 0,
    costTotal: 0,
    calls: 0,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
  };
  for (const row of rows) {
    const usage = (row.payload as { usage?: unknown }).usage;
    if (!isUsage(usage)) continue;
    total.totalTokens += usage.totalTokens;
    total.costTotal += usage.cost.total;
    total.input += usage.input;
    total.output += usage.output;
    total.cacheRead += usage.cacheRead;
    total.cacheWrite += usage.cacheWrite;
    total.calls += 1;
  }
  return total;
}
