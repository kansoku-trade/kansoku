import { useCallback, useSyncExternalStore } from 'react';
import type { CandleFeed, QuoteCell } from '@kansoku/shared/types';

type FeedKind = 'quotes' | 'preview';

interface FeedEntry {
  count: number;
  listeners: Set<() => void>;
  value: unknown;
}

const entries = new Map<string, FeedEntry>();

const feedStatus = { connected: false, degraded: false };

function normalizeSymbol(raw: string): string | null {
  let sym = raw.trim().toUpperCase();
  if (!sym) return null;
  if (!sym.includes('.')) sym += '.US';
  return /^[\d.A-Z]+$/.test(sym) ? sym : null;
}

function post(message: unknown): void {
  parent.postMessage(message, '*');
}

function subscribeFeed(kind: FeedKind, symbol: string, listener: () => void): () => void {
  const key = `${kind}:${symbol}`;
  let entry = entries.get(key);
  if (!entry) {
    entry = { count: 0, listeners: new Set(), value: null };
    entries.set(key, entry);
  }
  const current = entry;
  current.count += 1;
  current.listeners.add(listener);
  if (current.count === 1) post({ type: 'sub', kind, symbol });
  return () => {
    current.listeners.delete(listener);
    current.count -= 1;
    if (current.count > 0) return;
    entries.delete(key);
    post({ type: 'unsub', kind, symbol });
  };
}

window.addEventListener('message', (event: MessageEvent) => {
  const message = event.data as {
    type?: string;
    kind?: FeedKind;
    symbol?: string;
    data?: unknown;
    connected?: boolean;
    degraded?: boolean;
  } | null;
  if (!message || typeof message !== 'object') return;
  if (message.type === 'feed-status') {
    feedStatus.connected = Boolean(message.connected);
    feedStatus.degraded = Boolean(message.degraded);
    return;
  }
  if (message.type !== 'feed' || !message.kind || !message.symbol) return;
  const entry = entries.get(`${message.kind}:${message.symbol}`);
  if (!entry) return;
  entry.value = message.data ?? null;
  for (const listener of entry.listeners) listener();
});

function useFeed<T>(kind: FeedKind, symbol: string): T | null {
  const sym = normalizeSymbol(symbol);
  const subscribe = useCallback(
    (listener: () => void) => (sym ? subscribeFeed(kind, sym, listener) : () => {}),
    [kind, sym],
  );
  const snapshot = useCallback(
    () => (sym ? ((entries.get(`${kind}:${sym}`)?.value ?? null) as T | null) : null),
    [kind, sym],
  );
  return useSyncExternalStore(subscribe, snapshot);
}

export function useQuote(symbol: string): QuoteCell | null {
  return useFeed<QuoteCell>('quotes', symbol);
}

export function useCandles(symbol: string): CandleFeed | null {
  return useFeed<CandleFeed>('preview', symbol);
}
