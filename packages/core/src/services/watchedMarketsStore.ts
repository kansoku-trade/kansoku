import { eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { watchedMarketsSettings } from "../db/schema.js";
import { ClientError } from "../errors.js";
import type { Market } from "./symbol.utils.js";

export interface WatchedMarketsStore {
  get(): Market[];
  set(markets: Market[]): void;
  revision(): number;
}

const VALID_MARKETS: Market[] = ["US", "HK", "CN"];

export const DEFAULT_WATCHED_MARKETS: Market[] = ["US"];

export function validateWatchedMarkets(input: unknown): Market[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new ClientError('"markets" must be a non-empty array', 'e.g. ["US"]');
  }
  const deduped: Market[] = [];
  for (const item of input) {
    if (typeof item !== "string" || !VALID_MARKETS.includes(item as Market)) {
      throw new ClientError(`invalid market: ${String(item)}`, `expected one of ${VALID_MARKETS.join(", ")}`);
    }
    if (!deduped.includes(item as Market)) deduped.push(item as Market);
  }
  if (deduped.length === 0) {
    throw new ClientError("at least one market must be selected");
  }
  return deduped;
}

export function createWatchedMarketsStore(db: Db): WatchedMarketsStore {
  let rev = 0;

  const row = db.select().from(watchedMarketsSettings).where(eq(watchedMarketsSettings.id, 1)).get();
  let cache: Market[] = row ? row.markets : DEFAULT_WATCHED_MARKETS;

  return {
    get(): Market[] {
      return [...cache];
    },

    set(markets: Market[]): void {
      const validated = validateWatchedMarkets(markets);
      const updatedAt = new Date().toISOString();

      db.insert(watchedMarketsSettings)
        .values({ id: 1, markets: validated, updatedAt })
        .onConflictDoUpdate({
          target: watchedMarketsSettings.id,
          set: { markets: validated, updatedAt },
        })
        .run();

      cache = validated;
      rev += 1;
    },

    revision(): number {
      return rev;
    },
  };
}

let active: WatchedMarketsStore | null = null;

export function setActiveWatchedMarketsStore(store: WatchedMarketsStore | null): void {
  active = store;
}

export function getActiveWatchedMarketsStore(): WatchedMarketsStore {
  if (!active) {
    throw new Error("watchedMarketsStore: no active watched-markets store; call setActiveWatchedMarketsStore before use");
  }
  return active;
}

export function getWatchedMarketsOrDefault(): Market[] {
  return active ? active.get() : DEFAULT_WATCHED_MARKETS;
}
