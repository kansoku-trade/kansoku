import { and, asc, eq } from "drizzle-orm";
import type { CockpitComment, CommentLevel, CommentSource } from "../../../shared/types.js";
import { getDb, type Db } from "../db/index.js";
import { comments } from "../db/schema.js";
import { easternDate } from "../services/session.js";
import { notifyUser } from "./notify.js";

type Listener = (comment: CockpitComment) => void;

const listeners = new Map<string, Set<Listener>>();

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

function broadcast(comment: CockpitComment): void {
  const set = listeners.get(comment.symbol);
  if (!set) return;
  for (const listener of [...set]) {
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
    .orderBy(asc(comments.id));
  return rows.map(toComment);
}

export async function appendComment(comment: CockpitComment, db: Db = getDb()): Promise<void> {
  await db.insert(comments).values({
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
  if (comment.level === "alert") notifyUser(`${comment.symbol} 盘中警报`, comment.text);
}
