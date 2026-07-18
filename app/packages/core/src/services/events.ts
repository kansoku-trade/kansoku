import type { IntradayEventRisk, MacroEventItem } from "../../../../shared/types.js";
import { filterMacroForSymbol } from "../ai/eventFilter.js";
import { activeSettingsRevision } from "../ai/settingsStore.js";
import { getProvider } from "./marketdata/registry.js";
import { easternDate } from "./session.js";
import { marketOf, type Market } from "./symbol.utils.js";

const EARNINGS_TTL_MS = 6 * 60 * 60_000;
const MACRO_TTL_MS = 60 * 60_000;
const MACRO_WINDOW_DAYS = 3;
const MAX_MACRO_ITEMS = 8;
const MACRO_MIN_STAR = 3;

const earningsCache = new Map<string, { at: number; val: IntradayEventRisk["next_earnings"] }>();
const macroCache = new Map<Market, { at: number; val: MacroEventItem[] }>();
const relevanceCache = new Map<string, { at: number; fingerprint: string; val: MacroEventItem[] }>();

async function nextEarnings(symbol: string, now: Date): Promise<IntradayEventRisk["next_earnings"]> {
  const hit = earningsCache.get(symbol);
  if (hit && Date.now() - hit.at < EARNINGS_TTL_MS) return hit.val;
  let val: IntradayEventRisk["next_earnings"] = null;
  try {
    const today = easternDate(now);
    const provider = getProvider(marketOf(symbol));
    val = (await provider.getEarningsCalendar?.(symbol, today)) ?? null;
  } catch {
    val = null;
  }
  earningsCache.set(symbol, { at: Date.now(), val });
  return val;
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

async function relevantMacro(symbol: string, macro: MacroEventItem[], now: Date): Promise<MacroEventItem[]> {
  const upcoming = macro.filter((m) => Date.parse(m.ts) > now.getTime());
  if (!upcoming.length) return upcoming;
  const fingerprint = `${activeSettingsRevision()}|${upcoming.map((m) => `${m.ts}|${m.title}`).join("\n")}`;
  const hit = relevanceCache.get(symbol);
  if (hit && hit.fingerprint === fingerprint && Date.now() - hit.at < MACRO_TTL_MS) return hit.val;
  const val = await filterMacroForSymbol(symbol, upcoming).catch(() => upcoming);
  relevanceCache.set(symbol, { at: Date.now(), fingerprint, val });
  return val;
}

export async function getEventRisk(symbol: string, now = new Date()): Promise<IntradayEventRisk | null> {
  const market = marketOf(symbol);
  if (market !== "US") return null;
  const [earnings, macro] = await Promise.all([nextEarnings(symbol, now), macroReleases(now, market)]);
  const relevant = await relevantMacro(symbol, macro, now);
  if (!earnings && !relevant.length) return null;
  return { next_earnings: earnings, macro: relevant, updated_at: now.toISOString() };
}
