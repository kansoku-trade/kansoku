import { eq } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { watchedMarketsSettings } from '../db/schema.js';
import { z } from 'zod';
import { ClientError } from '../platform/errors.js';
import type { Market } from '../symbols/symbol.utils.js';

export interface WatchedMarketsStore {
  get(): Market[];
  set(markets: Market[]): void;
  revision(): number;
}

const VALID_MARKETS: [Market, ...Market[]] = ['US', 'HK', 'CN'];
const marketsArraySchema = z.array(z.unknown()).min(1);
const marketSchema = z.enum(VALID_MARKETS);

export const DEFAULT_WATCHED_MARKETS: Market[] = ['US'];

export function validateWatchedMarkets(input: unknown): Market[] {
  const items = marketsArraySchema.safeParse(input);
  if (!items.success) {
    throw new ClientError('"markets" must be a non-empty array', 'e.g. ["US"]');
  }
  const deduped: Market[] = [];
  for (const item of items.data) {
    const market = marketSchema.safeParse(item);
    if (!market.success) {
      throw new ClientError(
        `invalid market: ${String(item)}`,
        `expected one of ${VALID_MARKETS.join(', ')}`,
      );
    }
    if (!deduped.includes(market.data)) deduped.push(market.data);
  }
  if (deduped.length === 0) {
    throw new ClientError('at least one market must be selected');
  }
  return deduped;
}

export function createWatchedMarketsStore(db: Db): WatchedMarketsStore {
  let rev = 0;

  const row = db
    .select()
    .from(watchedMarketsSettings)
    .where(eq(watchedMarketsSettings.id, 1))
    .get();
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
    throw new Error(
      'watchedMarketsStore: no active watched-markets store; call setActiveWatchedMarketsStore before use',
    );
  }
  return active;
}

export function getWatchedMarketsOrDefault(): Market[] {
  return active ? active.get() : DEFAULT_WATCHED_MARKETS;
}
