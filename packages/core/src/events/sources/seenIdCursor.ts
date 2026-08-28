// A cursor for a source that hands out a page of items with stable ids and no way to
// ask for "everything after X". A high-water timestamp cannot be used here: the page
// is short, so an item that appears below the mark — a backlog after downtime, a
// back-dated story — would be skipped forever. Remembering the ids instead means the
// only failure mode left is replaying an item, which the domain's dedupe absorbs.

export interface SeenIds {
  ids: string[];
}

export type SeenIdCursor = Record<string, SeenIds>;

export const DEFAULT_MAX_SEEN_IDS = 200;

export function parseSeenIdCursor(raw: string | null): SeenIdCursor {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const cursor: SeenIdCursor = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const { ids } = value as { ids?: unknown };
      if (!Array.isArray(ids)) continue;
      cursor[key] = { ids: ids.filter((id): id is string => typeof id === 'string') };
    }
    return cursor;
  } catch {
    // Replaying is cheap; a failed source is not. An unreadable cursor costs one
    // cycle of duplicates.
    return {};
  }
}

export interface SeenIdTracker {
  isKnown(id: string): boolean;
  // `at` only orders the window: when the cap is reached the oldest items are the
  // ones we stop remembering, because a replay of an old story is quieter than a
  // duplicate of a fresh one.
  observe(id: string, at: string): void;
  value(): SeenIds;
}

export function createSeenIdTracker(
  seen: SeenIds | undefined,
  max: number = DEFAULT_MAX_SEEN_IDS,
): SeenIdTracker {
  const known = new Set(seen?.ids ?? []);
  const observed = new Map<string, string>();
  return {
    isKnown(id) {
      return known.has(id);
    },
    observe(id, at) {
      const previous = observed.get(id);
      if (previous === undefined || at > previous) observed.set(id, at);
    },
    value() {
      // Carried-over ids we did not see this round keep their place at the back: the
      // page they came from may simply have moved on, and forgetting them early is
      // what would replay them.
      const ranked = [...observed.entries()].sort(([, a], [, b]) => (a < b ? 1 : -1));
      const ids = [...new Set([...ranked.map(([id]) => id), ...known])];
      return { ids: ids.slice(0, Math.max(1, max)) };
    },
  };
}
