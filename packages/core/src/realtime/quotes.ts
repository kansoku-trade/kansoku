import type { QuoteCell, QuoteSnapshot } from '@kansoku/shared/types';
import { getProvider, getStream, onProviderRoutingChanged } from '../marketdata/registry.js';
import {
  distinctStreams,
  releaseSymbols,
  retainSymbols,
} from '../marketdata/streamRouting.js';
import { watchlistSymbols } from '../marketdata/watchlist.js';
import { marketOf } from '../symbols/symbol.utils.js';

export type { RawQuote } from '../marketdata/types.js';
export { normalizeQuote } from '../marketdata/quoteNormalize.js';

const SYMBOLS_TTL_MS = 600_000;
const COALESCE_MS = 250;

let baseSymbols: string[] = [];
let baseFetchedAt = 0;
let baseRefreshInFlight: Promise<void> | null = null;

async function refreshBaseSymbols(): Promise<void> {
  if (Date.now() - baseFetchedAt < SYMBOLS_TTL_MS && baseSymbols.length) return;
  if (baseRefreshInFlight) return baseRefreshInFlight;
  baseRefreshInFlight = (async () => {
    const provider = getProvider();
    const set = new Set<string>();
    const [watchlist, positions] = await Promise.allSettled([
      watchlistSymbols(provider),
      provider.getPositions?.() ?? Promise.resolve([]),
    ]);
    if (watchlist.status === 'fulfilled') {
      for (const s of watchlist.value) set.add(s);
    }
    if (positions.status === 'fulfilled') {
      for (const p of positions.value) set.add(p.symbol);
    }
    if (set.size) {
      const next = [...set];
      const dropped = baseSymbols.filter((s) => !set.has(s));
      const added = next.filter((s) => !baseSymbols.includes(s));
      baseSymbols = next;
      baseFetchedAt = Date.now();
      if (added.length) await retainSymbols(added).catch(() => {});
      if (dropped.length) await releaseSymbols(dropped).catch(() => {});
    }
  })().finally(() => {
    baseRefreshInFlight = null;
  });
  return baseRefreshInFlight;
}

const listeners = new Set<(env: string) => void>();
const dedup = new Set<string>();
let coalesceTimer: ReturnType<typeof setTimeout> | null = null;
let listenerHandles: Array<() => void> | null = null;
let routingUnsub: (() => void) | null = null;
let baseRefreshTimer: ReturnType<typeof setInterval> | null = null;
let baseRetained = false;
let degraded = false;
let lastEnvelope: string | null = null;

function emit(env: string): void {
  for (const l of listeners) l(env);
}

function buildSnapshot(): QuoteSnapshot {
  const seen = new Set<string>();
  const quotes: QuoteCell[] = [];
  for (const s of baseSymbols) {
    if (seen.has(s)) continue;
    seen.add(s);
    const cell = getStream(marketOf(s)).getSnapshot(s);
    if (cell) quotes.push(cell);
  }
  for (const s of extras.keys()) {
    if (seen.has(s)) continue;
    seen.add(s);
    const cell = getStream(marketOf(s)).getSnapshot(s);
    if (cell) quotes.push(cell);
  }
  return { ts: Date.now(), quotes };
}

function flushCoalesced(): void {
  coalesceTimer = null;
  dedup.clear();
  const snap = buildSnapshot();
  const env = JSON.stringify({ type: 'data', data: snap });
  if (env === lastEnvelope) return;
  lastEnvelope = env;
  emit(env);
}

function scheduleFlush(symbol: string): void {
  if (dedup.has(symbol) && coalesceTimer) return;
  dedup.add(symbol);
  if (coalesceTimer) return;
  coalesceTimer = setTimeout(flushCoalesced, COALESCE_MS);
}

function ensureListener(): void {
  if (!routingUnsub) routingUnsub = onProviderRoutingChanged(rewireStreamsForRoutingChange);
  if (listenerHandles) return;
  listenerHandles = distinctStreams().map((stream) =>
    stream.onUpdate((cell) => scheduleFlush(cell.symbol)),
  );
}

function rewireStreamsForRoutingChange(): void {
  if (listenerHandles) {
    for (const unsub of listenerHandles) unsub();
    listenerHandles = null;
  }
  lastEnvelope = null;
  if (!listeners.size) {
    baseRetained = false;
    return;
  }
  ensureListener();
  const symbols = new Set<string>(extras.keys());
  if (baseRetained) for (const s of baseSymbols) symbols.add(s);
  const list = [...symbols];
  if (list.length) {
    void retainSymbols(list)
      .then(() => scheduleFlush(list[0]))
      .catch(() => {});
  }
}

async function ensureBase(): Promise<void> {
  await refreshBaseSymbols();
  if (!baseRetained && baseSymbols.length) {
    await retainSymbols(baseSymbols).catch((err) => {
      degraded = true;
      console.warn(
        '[longbridge-stream] base retain failed:',
        err instanceof Error ? err.message : err,
      );
    });
    baseRetained = true;
  }
}

function startBaseRefreshTimer(): void {
  if (baseRefreshTimer) return;
  baseRefreshTimer = setInterval(() => {
    void refreshBaseSymbols().catch(() => {});
  }, SYMBOLS_TTL_MS);
}

function stopIfIdle(): void {
  if (listeners.size > 0) return;
  if (coalesceTimer) {
    clearTimeout(coalesceTimer);
    coalesceTimer = null;
  }
  if (baseRefreshTimer) {
    clearInterval(baseRefreshTimer);
    baseRefreshTimer = null;
  }
  if (listenerHandles) {
    for (const unsub of listenerHandles) unsub();
    listenerHandles = null;
  }
  if (routingUnsub) {
    routingUnsub();
    routingUnsub = null;
  }
  lastEnvelope = null;
  if (baseRetained && baseSymbols.length) {
    void releaseSymbols(baseSymbols).catch(() => {});
    baseRetained = false;
  }
}

const extras = new Map<string, number>();

function addExtras(symbols: string[]): string[] {
  const fresh: string[] = [];
  for (const s of symbols) {
    const n = (extras.get(s) ?? 0) + 1;
    extras.set(s, n);
    if (n === 1) fresh.push(s);
  }
  return fresh;
}

function removeExtras(symbols: string[]): string[] {
  const drop: string[] = [];
  for (const s of symbols) {
    const n = (extras.get(s) ?? 0) - 1;
    if (n <= 0) {
      extras.delete(s);
      drop.push(s);
    } else {
      extras.set(s, n);
    }
  }
  return drop;
}

export function subscribeQuotes(
  push: (envelope: string) => void,
  extraSymbols: string[] = [],
): () => void {
  const cleaned = extraSymbols.filter((s) => /^[\w.]+$/.test(s));
  const fresh = addExtras(cleaned);

  listeners.add(push);
  ensureListener();
  startBaseRefreshTimer();

  if (fresh.length) {
    void retainSymbols(fresh).catch((err) =>
      console.warn('[longbridge-stream] retain extras failed', err),
    );
  }
  void ensureBase().then(() => {
    if (lastEnvelope) push(lastEnvelope);
    else scheduleFlush(cleaned[0] ?? baseSymbols[0] ?? '');
  });
  if (degraded) push(JSON.stringify({ type: 'status', degraded: true }));
  if (lastEnvelope) push(lastEnvelope);

  return () => {
    listeners.delete(push);
    const drop = removeExtras(cleaned);
    if (drop.length) void releaseSymbols(drop).catch(() => {});
    stopIfIdle();
  };
}
