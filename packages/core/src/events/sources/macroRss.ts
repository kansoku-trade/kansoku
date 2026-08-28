import type { MarketEventClass, MarketEventSeverity } from '@kansoku/shared/types';
import type { EventPollContext, EventPollResult, EventSourceAdapter } from '../registry.js';
import type { MarketEventDraft } from '../types.js';
import { createHighWaterTracker, parseHighWaterCursor } from './highWaterCursor.js';
import { fetchTextCapped } from './httpFetch.js';
import { feedDocumentError, parseFeed } from './rss.js';

// One feed, one source. The Fed publishes monetary policy and everything else on
// separate channels, and a source that owns both would report itself healthy while
// half of it was dark.
export const FED_MONETARY_SOURCE = 'fed-monetary';
export const FED_PRESS_SOURCE = 'fed-press';
export const BLS_SOURCE = 'bls-rss';

export const FED_MONETARY_FEED = 'https://www.federalreserve.gov/feeds/press_monetary.xml';
export const FED_ALL_PRESS_FEED = 'https://www.federalreserve.gov/feeds/press_all.xml';
export const BLS_LATEST_FEED = 'https://www.bls.gov/feed/bls_latest.rss';

// Official press channels publish on a human schedule; a minute of latency on a
// statement that was embargoed to the second is not the bottleneck.
const DEFAULT_INTERVAL_MS = 60_000;

export interface RssAdapterOptions {
  source: string;
  eventClass: MarketEventClass;
  url: string;
  kind: string;
  severity: MarketEventSeverity;
  // Entries this source deliberately leaves to another one. Symbol-less events do
  // not cluster, so an item carried by two feeds would otherwise be two rows on the
  // timeline saying the same thing.
  excludes?: RegExp;
  fetch?: typeof globalThis.fetch;
  intervalMs?: number;
  timeoutMs?: number;
  maxBytes?: number;
}

export interface RssAdapterDeps {
  fetch?: typeof globalThis.fetch;
  intervalMs?: number;
  url?: string;
  timeoutMs?: number;
  maxBytes?: number;
}

function optional(deps: RssAdapterDeps): Partial<RssAdapterOptions> {
  return {
    ...(deps.fetch ? { fetch: deps.fetch } : {}),
    ...(deps.intervalMs !== undefined ? { intervalMs: deps.intervalMs } : {}),
    ...(deps.timeoutMs !== undefined ? { timeoutMs: deps.timeoutMs } : {}),
    ...(deps.maxBytes !== undefined ? { maxBytes: deps.maxBytes } : {}),
  };
}

export function createRssEventAdapter(options: RssAdapterOptions): EventSourceAdapter {
  const fetchImpl = options.fetch ?? globalThis.fetch;

  async function readFeed(signal: AbortSignal | undefined): Promise<string> {
    let xml: string;
    try {
      xml = await fetchTextCapped(options.url, {
        headers: { accept: 'application/rss+xml, application/xml' },
        ...(fetchImpl ? { fetch: fetchImpl } : {}),
        ...(options.maxBytes !== undefined ? { maxBytes: options.maxBytes } : {}),
        ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      // Named, because "timeout" on its own tells the user nothing about which
      // government channel went dark.
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message.includes(options.url) ? message : `${options.url} — ${message}`, {
        cause: error,
      });
    }
    // A 200 that is not a feed is a failure, not a quiet day: a maintenance page or
    // a stream cut off mid-item both parse to zero items, and "the Fed published
    // nothing" is the one conclusion we must not draw from a broken read.
    const problem = feedDocumentError(xml);
    if (problem) throw new Error(`${options.url}: ${problem}`);
    return xml;
  }

  async function poll({ cursor, signal }: EventPollContext): Promise<EventPollResult> {
    const nextCursor = parseHighWaterCursor(cursor);
    const drafts: MarketEventDraft[] = [];
    const xml = await readFeed(signal);

    const tracker = createHighWaterTracker(nextCursor[options.url]);
    for (const item of parseFeed(xml, options.url)) {
      // Without a guid or a link there is nothing stable to dedupe on, and an event
      // that re-arrives every minute is worse than a missing one.
      const identity = item.id ?? item.link;
      // Undated: a press release we cannot place in time would be stamped "now" and
      // read as breaking on every restart.
      if (!identity || !item.publishedAt) continue;
      if (options.excludes?.test(item.link ?? identity)) continue;
      const known = tracker.isKnown(item.publishedAt, identity);
      tracker.observe(item.publishedAt, identity);
      if (known) continue;
      drafts.push({
        class: options.eventClass,
        dedupeKey: identity,
        kind: options.kind,
        occurredAt: item.publishedAt,
        payload: {
          data: {
            feed: options.url,
            guid: item.id,
            // The feed's own wording of the date, kept next to the normalized
            // instant so a later dispute is settled on the source's text.
            publishedAt: item.rawPublishedAt ?? item.publishedAt,
          },
          title: item.title,
          ...(item.link ? { url: item.link } : {}),
        },
        // No symbol: a macro or policy event that belongs to no ticker is a
        // first-class event, not an incomplete one.
        severity: options.severity,
        source: options.source,
        symbols: [],
        trust: 'official',
      });
    }
    const value = tracker.value();
    if (value) nextCursor[options.url] = value;

    return { cursor: JSON.stringify(nextCursor), drafts };
  }

  return { intervalMs: options.intervalMs ?? DEFAULT_INTERVAL_MS, poll, source: options.source };
}

export function createFedMonetaryAdapter(deps: RssAdapterDeps = {}): EventSourceAdapter {
  return createRssEventAdapter({
    eventClass: 'policy',
    kind: 'monetary_policy',
    severity: 'notable',
    source: FED_MONETARY_SOURCE,
    url: deps.url ?? FED_MONETARY_FEED,
    ...optional(deps),
  });
}

export function createFedPressAdapter(deps: RssAdapterDeps = {}): EventSourceAdapter {
  return createRssEventAdapter({
    eventClass: 'policy',
    // The Fed files monetary releases under /pressreleases/monetary*, and they arrive
    // on the dedicated feed with a sharper classification. Should that convention
    // ever change, this source starts duplicating them — visibly — rather than
    // silently dropping something new.
    excludes: /\/pressreleases\/monetary/i,
    kind: 'press_release',
    severity: 'info',
    source: FED_PRESS_SOURCE,
    url: deps.url ?? FED_ALL_PRESS_FEED,
    ...optional(deps),
  });
}

export function createBlsRssAdapter(deps: RssAdapterDeps = {}): EventSourceAdapter {
  return createRssEventAdapter({
    eventClass: 'macro',
    kind: 'bls_release',
    severity: 'notable',
    source: BLS_SOURCE,
    url: deps.url ?? BLS_LATEST_FEED,
    ...optional(deps),
  });
}
