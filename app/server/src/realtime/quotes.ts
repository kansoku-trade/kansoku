import type { QuoteCell } from "../../../shared/types.js";
import { getProvider } from "../services/marketdata/registry.js";
import type { ExtendedQuote, RawQuote } from "../services/marketdata/types.js";
import { createPoller, type PollerHandle } from "./poller.js";

export type { RawQuote } from "../services/marketdata/types.js";

const QUOTE_INTERVAL_MS = 10_000;
const SYMBOLS_TTL_MS = 600_000;
const EXTENDED_FRESH_MS = 15 * 60_000;


export function normalizeQuote(q: RawQuote, nowMs: number): QuoteCell {
  const regularLast = Number(q.last);
  const regularPct = Number(q.change_percentage);
  const candidates: { session: string; ext: ExtendedQuote }[] = [];
  for (const [session, ext] of [
    ["盘前", q.pre_market],
    ["盘后", q.post_market],
    ["隔夜", q.overnight],
  ] as const) {
    if (ext?.last && ext.prev_close && ext.timestamp) candidates.push({ session, ext });
  }
  candidates.sort((a, b) => Date.parse(b.ext.timestamp!) - Date.parse(a.ext.timestamp!));
  const newest = candidates[0];
  if (newest && nowMs - Date.parse(newest.ext.timestamp!) <= EXTENDED_FRESH_MS) {
    const last = Number(newest.ext.last);
    const prev = Number(newest.ext.prev_close);
    return {
      symbol: q.symbol,
      session: newest.session,
      last,
      pct: prev ? (last / prev - 1) * 100 : 0,
      regularLast,
      regularPct,
    };
  }
  return { symbol: q.symbol, session: "日盘", last: regularLast, pct: regularPct, regularLast, regularPct };
}

let baseSymbols: string[] = [];
let baseFetchedAt = 0;

async function refreshBaseSymbols(): Promise<void> {
  if (Date.now() - baseFetchedAt < SYMBOLS_TTL_MS && baseSymbols.length) return;
  const provider = getProvider();
  const set = new Set<string>();
  const [watchlist, positions] = await Promise.allSettled([
    provider.getWatchlistSymbols?.() ?? Promise.resolve([]),
    provider.getPositions?.() ?? Promise.resolve([]),
  ]);
  if (watchlist.status === "fulfilled") {
    for (const s of watchlist.value) set.add(s);
  }
  if (positions.status === "fulfilled") {
    for (const p of positions.value) set.add(p.symbol);
  }
  if (set.size) {
    baseSymbols = [...set];
    baseFetchedAt = Date.now();
  }
}

const extras = new Map<string, number>();

function addExtras(symbols: string[]): void {
  for (const s of symbols) extras.set(s, (extras.get(s) ?? 0) + 1);
}

function removeExtras(symbols: string[]): void {
  for (const s of symbols) {
    const n = (extras.get(s) ?? 0) - 1;
    if (n <= 0) extras.delete(s);
    else extras.set(s, n);
  }
}

let poller: PollerHandle | null = null;

function getPoller(): PollerHandle {
  if (!poller) {
    poller = createPoller({
      intervalMs: QUOTE_INTERVAL_MS,
      task: async () => {
        await refreshBaseSymbols();
        const symbols = [...new Set([...baseSymbols, ...extras.keys()])];
        if (!symbols.length) return { ts: 0, quotes: [] };
        const raw = await getProvider().getQuotes(symbols);
        const now = Date.now();
        return { ts: now, quotes: raw.map((q) => normalizeQuote(q, now)) };
      },
      onStop: () => {
        poller = null;
      },
    });
  }
  return poller;
}

export function subscribeQuotes(push: (envelope: string) => void, extraSymbols: string[] = []): () => void {
  const cleaned = extraSymbols.filter((s) => /^[\w.]+$/.test(s));
  addExtras(cleaned);
  const unsub = getPoller().subscribe(push);
  return () => {
    unsub();
    removeExtras(cleaned);
  };
}
