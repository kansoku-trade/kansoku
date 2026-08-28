import type { IntradayEventRisk, MacroEventItem } from '@kansoku/shared/types';
import { getProvider } from './registry.js';
import { easternDate } from './session.js';
import { marketOf, type Market } from '../symbols/symbol.utils.js';

const EARNINGS_TTL_MS = 6 * 60 * 60_000;
const MACRO_TTL_MS = 60 * 60_000;
const MACRO_WINDOW_DAYS = 3;
const MAX_MACRO_ITEMS = 8;
const MACRO_MIN_STAR = 3;

interface EarningsEntry {
  at: number;
  val: IntradayEventRisk['next_earnings'];
  // True when the null is "the broker would not answer", not "no report scheduled".
  // The two are the same to the sidebar and must never be the same to a collector.
  failed: boolean;
}

const earningsCache = new Map<string, EarningsEntry>();
const macroCache = new Map<Market, { at: number; val: MacroEventItem[] }>();
const relevanceCache = new Map<
  string,
  { at: number; fingerprint: string; val: MacroEventItem[] }
>();

export function resetEventCachesForTests(): void {
  earningsCache.clear();
  macroCache.clear();
  relevanceCache.clear();
}

function fresh(entry: EarningsEntry | undefined): entry is EarningsEntry {
  return entry !== undefined && Date.now() - entry.at < EARNINGS_TTL_MS;
}

// Shares the cache with nextEarnings but not its failure contract: a caller that has
// to tell "no report scheduled" from "the broker would not answer" gets the error,
// and never gets a null the tolerant path parked there after a failure.
export async function nextEarningsStrict(
  symbol: string,
  now: Date,
): Promise<IntradayEventRisk['next_earnings']> {
  const hit = earningsCache.get(symbol);
  if (fresh(hit) && !hit.failed) return hit.val;
  const today = easternDate(now);
  const provider = getProvider(marketOf(symbol));
  const val = (await provider.getEarningsCalendar?.(symbol, today)) ?? null;
  earningsCache.set(symbol, { at: Date.now(), val, failed: false });
  return val;
}

export async function nextEarnings(
  symbol: string,
  now: Date,
): Promise<IntradayEventRisk['next_earnings']> {
  // Reads the failure entries too: a failed lookup is remembered as "none" for the
  // TTL, the same as before, because the sidebar would otherwise retry on every
  // render.
  const hit = earningsCache.get(symbol);
  if (fresh(hit)) return hit.val;
  try {
    return await nextEarningsStrict(symbol, now);
  } catch {
    earningsCache.set(symbol, { at: Date.now(), val: null, failed: true });
    return null;
  }
}

async function macroReleases(now: Date, market: Market): Promise<MacroEventItem[]> {
  const hit = macroCache.get(market);
  if (hit && Date.now() - hit.at < MACRO_TTL_MS) return hit.val;
  let val: MacroEventItem[] = [];
  try {
    const start = easternDate(now);
    const end = easternDate(new Date(now.getTime() + MACRO_WINDOW_DAYS * 86_400_000));
    const provider = getProvider(market);
    const result = await provider.getMacroCalendar?.(market, start, end, MACRO_MIN_STAR);
    if (result?.supported) {
      val = [...result.items].sort((a, b) => (a.ts < b.ts ? -1 : 1)).slice(0, MAX_MACRO_ITEMS);
    }
  } catch {
    val = [];
  }
  macroCache.set(market, { at: Date.now(), val });
  return val;
}

async function relevantMacro(
  symbol: string,
  macro: MacroEventItem[],
  now: Date,
): Promise<MacroEventItem[]> {
  const upcoming = macro.filter((m) => Date.parse(m.ts) > now.getTime());
  if (!upcoming.length) return upcoming;
  try {
    const [{ activeSettingsRevision }, { filterMacroForSymbol }] = await Promise.all([
      import('../ai/settings/settingsStore.js'),
      import('../ai/personas/eventFilter.js'),
    ]);
    const fingerprint = `${activeSettingsRevision()}|${upcoming.map((m) => `${m.ts}|${m.title}`).join('\n')}`;
    const hit = relevanceCache.get(symbol);
    if (hit && hit.fingerprint === fingerprint && Date.now() - hit.at < MACRO_TTL_MS) return hit.val;
    const val = await filterMacroForSymbol(symbol, upcoming).catch(() => upcoming);
    relevanceCache.set(symbol, { at: Date.now(), fingerprint, val });
    return val;
  } catch {
    return upcoming;
  }
}

export async function getEventRisk(
  symbol: string,
  now = new Date(),
): Promise<IntradayEventRisk | null> {
  const market = marketOf(symbol);
  if (market !== 'US') return null;
  const [earnings, macro] = await Promise.all([
    nextEarnings(symbol, now),
    macroReleases(now, market),
  ]);
  const relevant = await relevantMacro(symbol, macro, now);
  if (!earnings && !relevant.length) return null;
  return { next_earnings: earnings, macro: relevant, updated_at: now.toISOString() };
}
