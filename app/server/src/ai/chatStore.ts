import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { asc, eq } from "drizzle-orm";
import { getDb, type Db } from "../db/index.js";
import { chatMessages, chatSessions } from "../db/schema.js";
import { nextSnowflake } from "../db/snowflake.js";

export interface ChatSession {
  id: string;
  chartId: string;
  symbol: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageRow {
  id: string;
  sessionId: string;
  ts: string;
  role: string;
  payload: AgentMessage;
}

export function titleFromText(text: string): string {
  const collapsed = text.trim().replace(/\s+/g, " ");
  return [...collapsed].slice(0, 40).join("");
}

export async function getSessionByChartId(chartId: string, db: Db = getDb()): Promise<ChatSession | null> {
  const rows = await db.select().from(chatSessions).where(eq(chatSessions.chartId, chartId)).limit(1);
  return rows[0] ?? null;
}

export async function createSession(
  input: { chartId: string; symbol: string; title: string },
  db: Db = getDb(),
): Promise<ChatSession> {
  const now = new Date().toISOString();
  const session: ChatSession = {
    id: nextSnowflake(),
    chartId: input.chartId,
    symbol: input.symbol,
    title: input.title,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(chatSessions).values(session);
  return session;
}

export async function listMessages(sessionId: string, db: Db = getDb()): Promise<ChatMessageRow[]> {
  return db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(asc(chatMessages.ts), asc(chatMessages.id));
}

export async function appendMessages(sessionId: string, messages: AgentMessage[], db: Db = getDb()): Promise<void> {
  if (messages.length === 0) return;
  const now = new Date().toISOString();
  db.transaction((tx) => {
    for (const message of messages) {
      tx.insert(chatMessages)
        .values({ id: nextSnowflake(), sessionId, ts: now, role: message.role, payload: message })
        .run();
    }
    tx.update(chatSessions).set({ updatedAt: now }).where(eq(chatSessions.id, sessionId)).run();
  });
}
