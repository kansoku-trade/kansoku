import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { asc, eq, inArray, type AnyColumn } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { getDb, type Db } from '../../db/index.js';
import { chatMessages } from '../../db/schema.js';
import { nextSnowflake } from '../../db/snowflake.js';
import { stampSentAt } from './conversationShared.js';

export interface ConversationMessageRow {
  id: string;
  sessionId: string;
  ts: string;
  role: string;
  payload: AgentMessage;
}

export function titleFromText(text: string): string {
  const collapsed = text.trim().replaceAll(/\s+/g, ' ');
  return [...collapsed].slice(0, 40).join('');
}

export type ReplaceLastUserTurnResult =
  | { ok: false; reason: 'no_user' }
  | { ok: true; isFirstUser: boolean };

export interface ConversationSessionBase {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationStoreConfig<TSession extends ConversationSessionBase, TInput> {
  sessionTable: SQLiteTable;
  idColumn: AnyColumn;
  keyColumn: AnyColumn;
  buildSession: (input: TInput, now: string) => TSession;
}

export interface ConversationStore<TSession extends ConversationSessionBase, TInput> {
  getSessionByKey(key: string, db?: Db): Promise<TSession | null>;
  createSession(input: TInput, db?: Db): Promise<TSession>;
  listMessages(sessionId: string, db?: Db): Promise<ConversationMessageRow[]>;
  appendMessages(sessionId: string, messages: AgentMessage[], db?: Db): Promise<void>;
  replaceLastUserTurn(
    sessionId: string,
    text: string,
    db?: Db,
  ): Promise<ReplaceLastUserTurnResult>;
  updateTitle(sessionId: string, title: string, db?: Db): Promise<void>;
}

export function createConversationStore<TSession extends ConversationSessionBase, TInput>(
  config: ConversationStoreConfig<TSession, TInput>,
): ConversationStore<TSession, TInput> {
  async function getSessionByKey(key: string, db: Db = getDb()): Promise<TSession | null> {
    const rows = await db
      .select()
      .from(config.sessionTable)
      .where(eq(config.keyColumn, key))
      .limit(1);
    return (rows[0] as TSession | undefined) ?? null;
  }

  async function createSession(input: TInput, db: Db = getDb()): Promise<TSession> {
    const now = new Date().toISOString();
    const session = config.buildSession(input, now);
    await db.insert(config.sessionTable).values(session as Record<string, unknown>);
    return session;
  }

  async function listMessages(
    sessionId: string,
    db: Db = getDb(),
  ): Promise<ConversationMessageRow[]> {
    const rows = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(asc(chatMessages.ts), asc(chatMessages.id));
    return rows as ConversationMessageRow[];
  }

  async function appendMessages(
    sessionId: string,
    messages: AgentMessage[],
    db: Db = getDb(),
  ): Promise<void> {
    if (messages.length === 0) return;
    const now = new Date().toISOString();
    db.transaction((tx) => {
      for (const message of messages) {
        tx.insert(chatMessages)
          .values({ id: nextSnowflake(), sessionId, ts: now, role: message.role, payload: message })
          .run();
      }
      tx.update(config.sessionTable)
        .set({ updatedAt: now } as Record<string, unknown>)
        .where(eq(config.idColumn, sessionId))
        .run();
    });
  }

  async function replaceLastUserTurn(
    sessionId: string,
    text: string,
    db: Db = getDb(),
  ): Promise<ReplaceLastUserTurnResult> {
    const rows = await listMessages(sessionId, db);
    let lastUserIndex = -1;
    let firstUserIndex = -1;
    for (let index = 0; index < rows.length; index += 1) {
      if (rows[index]?.role !== 'user') continue;
      if (firstUserIndex === -1) firstUserIndex = index;
      lastUserIndex = index;
    }
    if (lastUserIndex === -1) return { ok: false, reason: 'no_user' };

    const lastUser = rows[lastUserIndex];
    const deleteIds = rows.slice(lastUserIndex + 1).map((row) => row.id);
    const sentAt = Date.now();
    const payload: AgentMessage = {
      ...(lastUser.payload as AgentMessage),
      role: 'user',
      content: stampSentAt(text, sentAt),
      timestamp: sentAt,
    };
    const now = new Date().toISOString();

    db.transaction((tx) => {
      if (deleteIds.length > 0) {
        tx.delete(chatMessages).where(inArray(chatMessages.id, deleteIds)).run();
      }
      tx.update(chatMessages)
        .set({ payload })
        .where(eq(chatMessages.id, lastUser.id))
        .run();
      tx.update(config.sessionTable)
        .set({ updatedAt: now } as Record<string, unknown>)
        .where(eq(config.idColumn, sessionId))
        .run();
    });

    return { ok: true, isFirstUser: firstUserIndex === lastUserIndex };
  }

  async function updateTitle(sessionId: string, title: string, db: Db = getDb()): Promise<void> {
    const now = new Date().toISOString();
    db.update(config.sessionTable)
      .set({ title, updatedAt: now } as Record<string, unknown>)
      .where(eq(config.idColumn, sessionId))
      .run();
  }

  return {
    getSessionByKey,
    createSession,
    listMessages,
    appendMessages,
    replaceLastUserTurn,
    updateTitle,
  };
}
