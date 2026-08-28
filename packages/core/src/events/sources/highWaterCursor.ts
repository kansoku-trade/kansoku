// Every polled source needs the same two things from its cursor: "how far did I
// get" and "which entries at that exact instant did I already take". A bare
// high-water mark loses the second one, and two filings or two press releases can
// share a timestamp to the millisecond.

export interface HighWater {
  at: string;
  ids: string[];
}

// Keyed by whatever the source polls one at a time — a symbol, a feed URL — so a
// busy stream cannot push the mark past a quiet one's next entry.
export type HighWaterCursor = Record<string, HighWater>;

export function parseHighWaterCursor(raw: string | null): HighWaterCursor {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const cursor: HighWaterCursor = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const { at, ids } = value as { at?: unknown; ids?: unknown };
      if (typeof at !== 'string') continue;
      cursor[key] = {
        at,
        ids: Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [],
      };
    }
    return cursor;
  } catch {
    // Replaying is cheap — the domain dedupes on the entry's own key — so an
    // unreadable cursor costs one wasted cycle instead of a failed source.
    return {};
  }
}

export interface HighWaterTracker {
  // True when this entry is at or behind where the last run stopped.
  isKnown(at: string, id: string): boolean;
  // Records that we have now taken this entry, for the next run's benefit.
  observe(at: string, id: string): void;
  value(): HighWater | null;
}

export function createHighWaterTracker(seen: HighWater | undefined): HighWaterTracker {
  let at = seen?.at ?? null;
  let ids = new Set(seen?.at ? seen.ids : []);
  return {
    isKnown(entryAt, id) {
      if (!seen) return false;
      if (entryAt < seen.at) return true;
      return entryAt === seen.at && seen.ids.includes(id);
    },
    observe(entryAt, id) {
      if (at === null || entryAt > at) {
        at = entryAt;
        ids = new Set([id]);
        return;
      }
      if (entryAt === at) ids.add(id);
    },
    value() {
      return at === null ? null : { at, ids: [...ids] };
    },
  };
}
