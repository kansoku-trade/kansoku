import { and, asc, desc, eq } from "drizzle-orm";
import type { CockpitComment, CommentLevel, CommentSource } from "../../../../shared/types.js";
import { getDb, type Db } from "../db/index.js";
import { comments } from "../db/schema.js";
import { nextSnowflake } from "../db/snowflake.js";
import { easternDate } from "../services/session.js";

type Listener = (comment: CockpitComment) => void;

const listeners = new Map<string, Set<Listener>>();
const anyListeners = new Set<Listener>();

export function onComment(symbol: string, listener: Listener): () => void {
  let set = listeners.get(symbol);
  if (!set) {
    set = new Set();
    listeners.set(symbol, set);
  }
  set.add(listener);
  return () => {
    const current = listeners.get(symbol);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) listeners.delete(symbol);
  };
}

export function onAnyComment(listener: Listener): () => void {
  anyListeners.add(listener);
  return () => anyListeners.delete(listener);
}

function broadcast(comment: CockpitComment): void {
  const set = listeners.get(comment.symbol);
  for (const listener of [...(set ?? []), ...anyListeners]) {
    try {
      listener(comment);
    } catch {
      continue;
    }
  }
}

function toComment(row: typeof comments.$inferSelect): CockpitComment {
  return {
    ts: row.ts,
    symbol: row.symbol,
    level: row.level as CommentLevel,
    text: row.text,
    ...(row.trigger != null ? { trigger: row.trigger } : {}),
    source: row.source as CommentSource,
    ...(row.escalated != null ? { escalated: row.escalated } : {}),
    ...(row.chartId != null ? { chartId: row.chartId } : {}),
  };
}

export async function listComments(symbol: string, date: string, db: Db = getDb()): Promise<CockpitComment[]> {
  const rows = await db
    .select()
    .from(comments)
    .where(and(eq(comments.symbol, symbol), eq(comments.easternDate, date)))
    .orderBy(asc(comments.ts), asc(comments.id));
  return rows.map(toComment);
}

export async function listCommentDates(symbol: string, db: Db = getDb(), limit = 30): Promise<string[]> {
  const rows = await db
    .selectDistinct({ date: comments.easternDate })
    .from(comments)
    .where(eq(comments.symbol, symbol))
    .orderBy(desc(comments.easternDate))
    .limit(limit);
  return rows.map((r) => r.date);
}

export async function listAllCommentDates(limit = 30, db: Db = getDb()): Promise<string[]> {
  const rows = await db
    .selectDistinct({ date: comments.easternDate })
    .from(comments)
    .orderBy(desc(comments.easternDate))
    .limit(limit);
  return rows.map((r) => r.date);
}

export async function latestCommentatorRunAt(symbol: string, date: string, db: Db = getDb()): Promise<number | null> {
  const [row] = await db
    .select({ ts: comments.ts })
    .from(comments)
    .where(
      and(
        eq(comments.symbol, symbol),
        eq(comments.easternDate, date),
        eq(comments.source, "commentator"),
      ),
    )
    .orderBy(desc(comments.ts), desc(comments.id))
    .limit(1);
  if (!row) return null;
  const parsed = Date.parse(row.ts);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function appendComment(comment: CockpitComment, db: Db = getDb()): Promise<void> {
  await db.insert(comments).values({
    id: nextSnowflake(),
    ts: comment.ts,
    easternDate: easternDate(new Date(comment.ts)),
    symbol: comment.symbol,
    level: comment.level,
    text: comment.text,
    trigger: comment.trigger ?? null,
    source: comment.source,
    escalated: comment.escalated ?? null,
    chartId: comment.chartId ?? null,
  });
  broadcast(comment);
}
