import { asc, eq } from "drizzle-orm";
import { getDb, type Db } from "../db/index.js";
import { symbolFollows } from "../db/schema.js";
import { normalizeSymbol } from "../services/symbol.utils.js";

export interface SymbolFollowState {
  symbol: string;
  following: boolean;
  startedAt: string | null;
}

export function symbolFollowState(symbol: string, db: Db = getDb()): SymbolFollowState {
  const normalized = normalizeSymbol(symbol);
  const row = db.select().from(symbolFollows).where(eq(symbolFollows.symbol, normalized)).get();
  return {
    symbol: normalized,
    following: Boolean(row),
    startedAt: row?.startedAt ?? null,
  };
}

export function listFollowedSymbols(db: Db = getDb()): string[] {
  return db
    .select({ symbol: symbolFollows.symbol })
    .from(symbolFollows)
    .orderBy(asc(symbolFollows.symbol))
    .all()
    .map((row) => row.symbol);
}

export function setSymbolFollowing(
  symbol: string,
  following: boolean,
  db: Db = getDb(),
  now: () => Date = () => new Date(),
): SymbolFollowState {
  const normalized = normalizeSymbol(symbol);
  if (following) {
    db.insert(symbolFollows)
      .values({ symbol: normalized, startedAt: now().toISOString() })
      .onConflictDoNothing({ target: symbolFollows.symbol })
      .run();
  } else {
    db.delete(symbolFollows).where(eq(symbolFollows.symbol, normalized)).run();
  }
  return symbolFollowState(normalized, db);
}
