import type { HomeEventItem, HomeEvents, MacroEventItem } from '@kansoku/shared/types';
import { nextEarningsStrict } from '../marketdata/events.js';
import { getProvider } from '../marketdata/registry.js';
import { easternDate } from '../marketdata/session.js';
import { getWatchedMarketsOrDefault } from '../marketdata/watchedMarketsStore.js';
import { getWatchSymbolsStrict } from './homeExtras.js';

const EVENTS_TTL_MS = 5 * 60_000;
const EARNINGS_WINDOW_DAYS = 14;
const MACRO_WINDOW_DAYS = 7;
const MACRO_MIN_STAR = 3;
const EARNINGS_CONCURRENCY = 3;

interface CachedEvents {
  at: number;
  date: string;
  value: HomeEvents;
  // What the read cost to produce, kept next to it. The home page caches whatever it
  // managed to gather, so without this the strict reader cannot tell a complete
  // calendar from the leftovers of a failed one.
  failures: string[];
  sourceCalls: number;
  sourceFailures: number;
}

let eventsCache: CachedEvents | null = null;

export function resetHomeEventsForTests(): void {
  eventsCache = null;
}

async function ownedSymbols(): Promise<Set<string>> {
  try {
    const positions = (await getProvider().getPositions?.()) ?? [];
    return new Set(positions.map((p) => p.symbol));
  } catch {
    return new Set();
  }
}

// Only calls to a calendar source are counted, so the caller can tell "nothing
// scheduled" from "nothing answered". The watchlist read is deliberately excluded:
// it is an input to the calendar, and letting it answer for the calendar is how a
// completely dead calendar used to pass for a quiet week.
interface Collected {
  items: HomeEventItem[];
  failures: string[];
  sourceCalls: number;
  sourceFailures: number;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function earningsItems(
  symbols: string[],
  owned: Set<string>,
  now: Date,
  collected: Collected,
): Promise<HomeEventItem[]> {
  const cutoff = easternDate(new Date(now.getTime() + EARNINGS_WINDOW_DAYS * 86_400_000));
  const items: HomeEventItem[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(EARNINGS_CONCURRENCY, symbols.length) }, async () => {
      while (next < symbols.length) {
        const symbol = symbols[next++];
        collected.sourceCalls += 1;
        let entry: Awaited<ReturnType<typeof nextEarningsStrict>>;
        try {
          entry = await nextEarningsStrict(symbol, now);
        } catch (error) {
          collected.sourceFailures += 1;
          collected.failures.push(`earnings ${symbol} — ${messageOf(error)}`);
          continue;
        }
        if (!entry || entry.date > cutoff) continue;
        items.push({
          date: entry.date,
          ts: null,
          kind: 'earnings',
          symbol,
          title: entry.title,
          estimate: null,
          previous: null,
          actual: null,
          owned: owned.has(symbol),
          // Symbol plus report date is the identity here; the calendar has no id of
          // its own to pass along.
          sourceId: null,
        });
      }
    }),
  );
  return items;
}

function macroItem(item: MacroEventItem): HomeEventItem {
  return {
    date: easternDate(new Date(item.ts)),
    ts: item.ts,
    kind: 'macro',
    symbol: null,
    title: item.title,
    estimate: item.estimate,
    previous: item.previous,
    actual: item.actual ?? null,
    owned: false,
    // Carried through untouched: a consumer that needs to recognize this slot again
    // has nothing else to go on once the print rewrites the title.
    sourceId: item.sourceId ?? null,
  };
}

async function macroItems(now: Date, collected: Collected): Promise<HomeEventItem[]> {
  const provider = getProvider();
  if (!provider.getMacroCalendar) return [];
  const start = easternDate(now);
  const end = easternDate(new Date(now.getTime() + MACRO_WINDOW_DAYS * 86_400_000));
  const items: HomeEventItem[] = [];
  for (const market of getWatchedMarketsOrDefault()) {
    collected.sourceCalls += 1;
    try {
      const result = await provider.getMacroCalendar(market, start, end, MACRO_MIN_STAR);
      if (!result.supported) continue;
      for (const item of result.items) items.push(macroItem(item));
    } catch (error) {
      collected.sourceFailures += 1;
      collected.failures.push(`macro ${market} — ${messageOf(error)}`);
      continue;
    }
  }
  return items;
}

function sortKey(item: HomeEventItem): string {
  return `${item.date}|${item.ts ?? ''}|${item.kind}|${item.symbol ?? ''}`;
}

async function collectHomeEvents(now: Date): Promise<Collected> {
  const collected: Collected = { failures: [], items: [], sourceCalls: 0, sourceFailures: 0 };
  let symbols: string[] = [];
  try {
    symbols = await getWatchSymbolsStrict();
  } catch (error) {
    // Recorded so the read is never cached as complete, but not counted as a calendar
    // call: with no symbols there is nothing to ask the earnings calendar about.
    collected.failures.push(messageOf(error));
  }
  const owned = await ownedSymbols();
  const [earnings, macro] = await Promise.all([
    earningsItems(symbols, owned, now, collected),
    macroItems(now, collected),
  ]);
  collected.items = [...earnings, ...macro].sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1));
  return collected;
}

function cachedFor(date: string): CachedEvents | null {
  const fresh =
    eventsCache && eventsCache.date === date && Date.now() - eventsCache.at < EVENTS_TTL_MS;
  return fresh ? eventsCache : null;
}

function remember(date: string, collected: Collected): HomeEvents {
  const value: HomeEvents = { date, items: collected.items };
  eventsCache = {
    at: Date.now(),
    date,
    value,
    failures: collected.failures,
    sourceCalls: collected.sourceCalls,
    sourceFailures: collected.sourceFailures,
  };
  return value;
}

export async function buildHomeEvents(now = new Date()): Promise<HomeEvents> {
  const date = easternDate(now);
  const cached = cachedFor(date);
  // Unchanged for the home page: a partial calendar beats an error card, and it is
  // held for the TTL rather than retried on every render.
  if (cached) return cached.value;
  return remember(date, await collectHomeEvents(now));
}

export interface HomeEventsRead {
  events: HomeEvents;
  // One line per upstream read that refused, so a collector can degrade with a
  // reason instead of reporting a suspiciously short calendar as healthy.
  failures: string[];
}

// The same window the home page shows, read with the failures kept. Nothing is
// cached unless the read was complete: a half-empty calendar that lingers for the
// TTL is indistinguishable from a quiet week.
export async function buildHomeEventsStrict(now = new Date()): Promise<HomeEventsRead> {
  const date = easternDate(now);
  const cached = cachedFor(date);
  // Only a complete read may be reused. An incomplete one is re-read from the
  // provider: the home page is happy to hold half a calendar for the TTL, but handing
  // that to the collector as failures: [] is how a dead source reports itself healthy
  // — and it would also hide a source that recovered inside the same window.
  if (cached && cached.failures.length === 0) return { events: cached.value, failures: [] };

  const collected = await collectHomeEvents(now);
  const { failures, sourceCalls, sourceFailures } = collected;
  // Nothing the calendar was asked actually answered. Reporting that as an empty
  // calendar would let the source sit at "active" with an empty week behind it, so it
  // throws and the collector backs off instead.
  if (failures.length > 0 && sourceFailures === sourceCalls) {
    throw new Error(`home calendar unavailable: ${failures.join('; ')}`);
  }
  // A partial read is still worth showing on the home page, so it replaces the cache
  // with its own failure list attached rather than being dropped on the floor.
  const value = remember(date, collected);
  return { events: value, failures };
}
