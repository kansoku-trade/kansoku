import type { MarketTemp } from '@kansoku/shared/types';
import type { FlowRow } from '../analysis/simple.js';
import { getProvider } from '../marketdata/registry.js';

const FLOW_TTL_MS = 60_000;
const OPTION_SYMBOL_RE = /\d{6}[CP]\d+/;

export function flowEligible(symbol: string): boolean {
  return !symbol.startsWith('.') && !OPTION_SYMBOL_RE.test(symbol);
}

const TEMP_TTL_MS = 10 * 60_000;
const WATCH_TTL_MS = 10 * 60_000;
const FLOW_CONCURRENCY = 1;

const CAPS_TTL_MS = 30 * 60_000;

interface HomeExtras {
  flows: Record<string, number | null>;
  flows_at: number | null;
  market: MarketTemp | null;
  caps: Record<string, number>;
}

let flowCache = new Map<string, { at: number; value: number | null }>();
let tempCache: { at: number; value: MarketTemp | null } | null = null;
let watchCache: { at: number; symbols: string[] } | null = null;
let capsCache: { at: number; value: Record<string, number> } | null = null;
let warming: Promise<void> | null = null;
let warmQueued: string[] | null = null;
const extrasListeners = new Set<() => void>();

export function resetHomeExtrasForTests(): void {
  flowCache = new Map();
  tempCache = null;
  watchCache = null;
  capsCache = null;
  warming = null;
  warmQueued = null;
  extrasListeners.clear();
}

export function onHomeExtrasChange(listener: () => void): () => void {
  extrasListeners.add(listener);
  return () => {
    extrasListeners.delete(listener);
  };
}

export function homeExtrasWarm(): Promise<void> {
  return warming ?? Promise.resolve();
}

async function getCaps(symbols: string[]): Promise<Record<string, number>> {
  if (!symbols.length) return {};
  if (capsCache && Date.now() - capsCache.at < CAPS_TTL_MS) {
    const missing = symbols.filter((s) => !(s in capsCache!.value));
    if (!missing.length) return capsCache.value;
  }
  const provider = getProvider();
  if (!provider.getMarketCaps) return capsCache?.value ?? {};
  try {
    const value = await provider.getMarketCaps(symbols);
    capsCache = { at: Date.now(), value };
    return value;
  } catch {
    return capsCache?.value ?? {};
  }
}

export function netInflow(rows: FlowRow[]): number {
  return rows.reduce((sum, row) => {
    const value = Number(row.inflow);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
}

async function fetchNetInflow(symbol: string): Promise<number | null> {
  const provider = getProvider();
  if (!provider.getFlow) return null;
  try {
    return netInflow(await provider.getFlow(symbol));
  } catch {
    return null;
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function getFlows(symbols: string[]): Promise<Record<string, number | null>> {
  const now = Date.now();
  const stale = symbols.filter((s) => {
    const cached = flowCache.get(s);
    return !cached || now - cached.at >= FLOW_TTL_MS;
  });
  if (stale.length) {
    const values = await mapWithConcurrency(stale, FLOW_CONCURRENCY, fetchNetInflow);
    stale.forEach((symbol, i) => flowCache.set(symbol, { at: now, value: values[i] }));
  }
  return Object.fromEntries(symbols.map((s) => [s, flowCache.get(s)?.value ?? null]));
}

async function getMarketTemp(): Promise<MarketTemp | null> {
  if (tempCache && Date.now() - tempCache.at < TEMP_TTL_MS) return tempCache.value;
  const provider = getProvider();
  const value = provider.getMarketTemp ? await provider.getMarketTemp('US').catch(() => null) : null;
  tempCache = { at: Date.now(), value };
  return value;
}

export async function getWatchSymbols(): Promise<string[]> {
  if (watchCache && Date.now() - watchCache.at < WATCH_TTL_MS) return watchCache.symbols;
  const provider = getProvider();
  const set = new Set<string>();
  const [watchlist, positions] = await Promise.allSettled([
    provider.getWatchlistSymbols?.() ?? Promise.resolve([]),
    provider.getPositions?.() ?? Promise.resolve([]),
  ]);
  if (watchlist.status === 'fulfilled') for (const s of watchlist.value) set.add(s);
  if (positions.status === 'fulfilled') for (const p of positions.value) set.add(p.symbol);
  const symbols = [...set];
  if (symbols.length) watchCache = { at: Date.now(), symbols };
  return symbols;
}

function snapshotExtras(symbols: string[], market: MarketTemp | null): HomeExtras {
  const flows = Object.fromEntries(symbols.map((s) => [s, flowCache.get(s)?.value ?? null]));
  const hasFlow = Object.values(flows).some((v) => v != null);
  return {
    flows,
    flows_at: hasFlow ? Date.now() : null,
    market,
    caps: capsCache?.value ?? {},
  };
}

function flowsNeedRefresh(symbols: string[]): boolean {
  const now = Date.now();
  return symbols.some((s) => {
    const cached = flowCache.get(s);
    return !cached || now - cached.at >= FLOW_TTL_MS;
  });
}

function capsNeedRefresh(symbols: string[]): boolean {
  if (!symbols.length) return false;
  if (!getProvider().getMarketCaps) return false;
  if (!capsCache || Date.now() - capsCache.at >= CAPS_TTL_MS) return true;
  return symbols.some((s) => !(s in capsCache!.value));
}

function notifyExtrasChange(): void {
  for (const listener of extrasListeners) listener();
}

function startWarm(symbols: string[]): void {
  if (warming) {
    warmQueued = [...new Set([...(warmQueued ?? []), ...symbols])];
    return;
  }
  if (!flowsNeedRefresh(symbols) && !capsNeedRefresh(symbols)) return;
  warming = (async () => {
    if (symbols.length) await getFlows(symbols).catch(() => {});
    await getCaps(symbols);
    notifyExtrasChange();
  })().finally(() => {
    warming = null;
    const next = warmQueued;
    warmQueued = null;
    if (next) startWarm(next);
  });
}

export async function buildHomeExtras(extraSymbols: string[]): Promise<HomeExtras> {
  const [watch, market] = await Promise.all([
    getWatchSymbols().catch(() => []),
    getMarketTemp().catch(() => null),
  ]);
  const symbols = [...new Set([...watch, ...extraSymbols])].filter(flowEligible);
  const extras = snapshotExtras(symbols, market);
  startWarm(symbols);
  return extras;
}
