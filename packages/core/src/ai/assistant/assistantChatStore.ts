import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb, type Db } from '../../db/index.js';
import { assistantSessions, chatMessages } from '../../db/schema.js';
import { nextSnowflake } from '../../db/snowflake.js';
import { stripSentAt, textOf } from '../conversation/conversationShared.js';
import {
  type ConversationMessageRow,
  type ConversationSessionBase,
  createConversationStore,
  titleFromText,
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

export interface AssistantSessionDigest {
  messageCount: number;
  preview: string | null;
}

function userText(message: AgentMessage): string {
  if (message.role !== 'user') return '';
  if (typeof message.content === 'string') return stripSentAt(message.content);
  return stripSentAt(message.content.map((block) => textOf(block)).join(''));
}

export async function digestAssistantSessions(
  ids: string[],
  db: Db = getDb(),
): Promise<Map<string, AssistantSessionDigest>> {
  const digests = new Map<string, AssistantSessionDigest>();
  if (ids.length === 0) return digests;
  const counts = await db
    .select({ sessionId: chatMessages.sessionId, total: count() })
    .from(chatMessages)
    .where(inArray(chatMessages.sessionId, ids))
    .groupBy(chatMessages.sessionId);
  for (const row of counts) digests.set(row.sessionId, { messageCount: row.total, preview: null });
  const firstUserRows = await db
    .select({ sessionId: chatMessages.sessionId, payload: chatMessages.payload })
    .from(chatMessages)
    .where(
      and(
        inArray(chatMessages.sessionId, ids),
        eq(chatMessages.role, 'user'),
        sql`${chatMessages.id} = (select m.id from chat_messages m where m.session_id = ${chatMessages.sessionId} and m.role = 'user' order by m.ts, m.id limit 1)`,
      ),
    );
  for (const row of firstUserRows) {
    const digest = digests.get(row.sessionId);
    if (!digest) continue;
    const preview = titleFromText(userText(row.payload as AgentMessage));
    digest.preview = preview || null;
  }
  return digests;
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
