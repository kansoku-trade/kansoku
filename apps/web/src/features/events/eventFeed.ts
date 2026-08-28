import type { MarketEvent } from '@kansoku/shared/types';

// The tape is a rolling window, not an archive: older rows come back from the
// keyset-paged HTTP list, so holding every event a long-lived tab ever saw only
// costs memory.
export const EVENT_FEED_LIMIT = 200;

function compare(a: MarketEvent, b: MarketEvent): number {
  const at = Date.parse(a.occurredAt);
  const bt = Date.parse(b.occurredAt);
  if (at !== bt) return bt - at;
  // Several events routinely share one occurredAt (a filing batch, a macro
  // release). Without a second key the list would reshuffle on every merge.
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/**
 * Folds incoming events into the current feed keyed on the stable event id, so a
 * cluster that resends an id replaces the row instead of adding a second one.
 */
export function mergeMarketEvents(
  current: readonly MarketEvent[],
  incoming: readonly MarketEvent[],
  limit: number = EVENT_FEED_LIMIT,
): MarketEvent[] {
  const byId = new Map(current.map((event) => [event.id, event]));
  for (const event of incoming) byId.set(event.id, event);
  return [...byId.values()].sort(compare).slice(0, limit);
}

export function occurredAtOrBefore(events: readonly MarketEvent[], nowMs: number): MarketEvent[] {
  return events.filter((event) => Date.parse(event.occurredAt) <= nowMs);
}
