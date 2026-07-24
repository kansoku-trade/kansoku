import { eq, inArray, lt } from 'drizzle-orm';
import type { RawBar, TimeframeKey } from '@kansoku/shared/types';
import { getDb, type Db } from '../db/index.js';
import { symbolCandleCache } from '../db/schema.js';
import { TIMEFRAME_ORDER } from '../analysis/intraday/constants.js';

const MAX_ROWS = 30;
const MAX_AGE_MS = 7 * 24 * 3_600_000;
const WRITE_INTERVAL_MS = 60_000;
const MIN_M5_BARS = 50;

export interface CachedCandles {
  timeframes: Partial<Record<TimeframeKey, RawBar[]>>;
  dayKline: RawBar[] | null;
  lastFetchAt: number;
}

const lastWriteAt = new Map<string, number>();

export function loadCandleCache(symbol: string, db: Db = getDb()): CachedCandles | null {
  try {
    const row = db
      .select()
      .from(symbolCandleCache)
      .where(eq(symbolCandleCache.symbol, symbol))
      .get();
    if (!row) return null;
    if (Date.now() - Date.parse(row.updatedAt) > MAX_AGE_MS) return null;
    const timeframes = row.timeframes;
    for (const tf of TIMEFRAME_ORDER) {
      if (!Array.isArray(timeframes[tf]) || timeframes[tf]!.length === 0) return null;
    }
    if (timeframes.m5!.length < MIN_M5_BARS) return null;
    return { timeframes, dayKline: row.dayKline ?? null, lastFetchAt: row.lastFetchAt };
  } catch (err) {
    console.warn('[candle-cache] load failed', symbol, err);
    return null;
  }
}

export function saveCandleCache(
  symbol: string,
  data: CachedCandles,
  db: Db = getDb(),
): void {
  try {
    const updatedAt = new Date().toISOString();
    db.insert(symbolCandleCache)
      .values({
        symbol,
        timeframes: data.timeframes,
        dayKline: data.dayKline,
        lastFetchAt: data.lastFetchAt,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: symbolCandleCache.symbol,
        set: {
          timeframes: data.timeframes,
          dayKline: data.dayKline,
          lastFetchAt: data.lastFetchAt,
          updatedAt,
        },
      })
      .run();
    lastWriteAt.set(symbol, Date.now());
    prune(db);
  } catch (err) {
    console.warn('[candle-cache] save failed', symbol, err);
  }
}

export function maybeSaveCandleCache(symbol: string, data: CachedCandles, db: Db = getDb()): void {
  const last = lastWriteAt.get(symbol) ?? 0;
  if (Date.now() - last < WRITE_INTERVAL_MS) return;
  saveCandleCache(symbol, data, db);
}

function prune(db: Db): void {
  const cutoff = new Date(Date.now() - MAX_AGE_MS).toISOString();
  db.delete(symbolCandleCache).where(lt(symbolCandleCache.updatedAt, cutoff)).run();
  const overflow = db
    .select({ symbol: symbolCandleCache.symbol })
    .from(symbolCandleCache)
    .orderBy(symbolCandleCache.updatedAt)
    .all()
    .slice(0, -MAX_ROWS)
    .map((row) => row.symbol);
  if (overflow.length > 0) {
    db.delete(symbolCandleCache).where(inArray(symbolCandleCache.symbol, overflow)).run();
  }
}
