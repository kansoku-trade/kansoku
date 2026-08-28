import type { NewsItem } from '@kansoku/shared/types';
import type { EventPollContext, EventPollResult, EventSourceAdapter } from '../registry.js';
import type { MarketEventDraft } from '../types.js';
import {
  createSeenIdTracker,
  DEFAULT_MAX_SEEN_IDS,
  parseSeenIdCursor,
} from './seenIdCursor.js';

export const LONGBRIDGE_NEWS_SOURCE = 'longbridge-news';

const DEFAULT_INTERVAL_MS = 60_000;
// The upstream has no "since" parameter, so the page itself is the only window we
// get. Asking for a screenful was the reason a busy minute could push a headline off
// the page before we ever read it.
export const NEWS_DEFAULT_PAGE_SIZE = 50;

export interface LongbridgeNewsAdapterDeps {
  // Watchlist ∪ positions. Injected rather than read from the provider registry so
  // the adapter can be exercised without a broker session.
  symbols: () => Promise<string[]>;
  // Must reject when the read failed. "No news" and "the broker would not answer"
  // have to be distinguishable here, or the source reports itself healthy while dark.
  getNews: (symbol: string, limit?: number) => Promise<NewsItem[]>;
  intervalMs?: number;
  limit?: number;
  maxSeenIds?: number;
}

function toInstant(published: string): string | null {
  const at = Date.parse(published);
  return Number.isFinite(at) ? new Date(at).toISOString() : null;
}

interface Collected {
  draft: MarketEventDraft;
  symbols: string[];
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createLongbridgeNewsAdapter(deps: LongbridgeNewsAdapterDeps): EventSourceAdapter {
  const limit = deps.limit ?? NEWS_DEFAULT_PAGE_SIZE;
  const maxSeenIds = deps.maxSeenIds ?? DEFAULT_MAX_SEEN_IDS;

  async function poll({ cursor }: EventPollContext): Promise<EventPollResult> {
    // A failure here is not a news failure: without the watch list the cycle has no
    // subject at all, so it degrades the source instead of reporting "quiet".
    const symbols = await deps.symbols();
    if (symbols.length === 0) return { drafts: [] };

    const nextCursor = parseSeenIdCursor(cursor);
    // Keyed by news id: the same wire story attached to two watched names is one
    // event carrying both symbols, not two events the UI has to reconcile.
    const collected = new Map<string, Collected>();
    const failures: unknown[] = [];

    for (const symbol of symbols) {
      let items: NewsItem[];
      try {
        items = await deps.getNews(symbol, limit);
      } catch (error) {
        // One unreadable name must not cost us the names that answered.
        failures.push(error);
        continue;
      }
      const tracker = createSeenIdTracker(nextCursor[symbol], maxSeenIds);
      for (const item of items) {
        const occurredAt = toInstant(item.published_at);
        // Undated news cannot be placed on a timeline, and stamping it "now" would
        // make every re-poll look like breaking news.
        if (!occurredAt) continue;
        const known = tracker.isKnown(item.id);
        tracker.observe(item.id, occurredAt);
        if (known) continue;
        const existing = collected.get(item.id);
        if (existing) {
          if (!existing.symbols.includes(symbol)) existing.symbols.push(symbol);
          continue;
        }
        collected.set(item.id, {
          draft: {
            class: 'news',
            dedupeKey: item.id,
            kind: 'headline',
            occurredAt,
            payload: {
              // The raw published_at is kept next to the normalized instant: the
              // source's own wording is what a later dispute is settled on.
              data: { newsId: item.id, publishedAt: item.published_at, symbols: [] },
              title: item.title,
              ...(item.url ? { url: item.url } : {}),
            },
            severity: 'info',
            source: LONGBRIDGE_NEWS_SOURCE,
            symbols: [],
            trust: 'verified',
          },
          symbols: [symbol],
        });
      }
      nextCursor[symbol] = tracker.value();
    }

    if (failures.length === symbols.length) {
      throw new Error(
        `longbridge news failed for all ${symbols.length} watched symbols: ${messageOf(failures[0])}`,
      );
    }

    const drafts = [...collected.values()].map(({ draft, symbols: covered }) => ({
      ...draft,
      payload: { ...draft.payload, data: { ...draft.payload.data, symbols: covered } },
      symbols: covered,
    }));

    return { cursor: JSON.stringify(nextCursor), drafts };
  }

  return {
    intervalMs: deps.intervalMs ?? DEFAULT_INTERVAL_MS,
    poll,
    source: LONGBRIDGE_NEWS_SOURCE,
  };
}
