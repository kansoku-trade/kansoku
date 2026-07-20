import type { QuoteCell } from '@kansoku/shared/types';
import { classifySession, sessionLabel } from './session.js';
import { marketOf } from '../symbols/symbol.utils.js';
import { getProvider } from './registry.js';
import { CandleAggregator, type CandleBar, type CandlePeriod } from './candleAggregator.js';
import {
  SUB_TYPE_QUOTE,
  SUB_TYPE_TRADE,
  TRADE_SESSION_OVERNIGHT,
  TRADE_SESSION_POST,
  TRADE_SESSION_PRE,
  type ProtocolQuote,
} from './longbridgeProtocol.js';
import type { LongbridgeQuoteSocket } from './longbridgeSocket.js';
import { getSharedQuoteSocket } from './sharedSocket.js';
import type { CandleListener, QuoteListener, QuoteStream } from './quoteStream.js';

export type { CandleBar, CandlePeriod };

const PREV_CLOSE_TTL_MS = 30 * 60_000;
const PREV_CLOSE_RETRY_MS = 60_000;

type PrevCloseCache = {
  regular: number;
  pre: number;
  post: number;
  overnight: number;
  fetchedAt: number;
};

function pctOf(last: number, prev: number): number | null {
  return prev ? (last / prev - 1) * 100 : null;
}

function candleKey(symbol: string, period: CandlePeriod): string {
  return `${symbol}\0${period}`;
}

function extendedLast(
  value: { last?: string; prev_close?: string } | undefined,
  fallback: number,
): number {
  return value?.prev_close ? Number(value.prev_close) : fallback;
}

export interface LongbridgeStreamDeps {
  socket?: LongbridgeQuoteSocket;
}

export class LongbridgeStream implements QuoteStream {
  private readonly socket: LongbridgeQuoteSocket;
  private readonly aggregator: CandleAggregator;
  private snapshots = new Map<string, QuoteCell>();
  private prevCloseCache = new Map<string, PrevCloseCache>();
  private lastRegular = new Map<string, { last: number; pct: number | null }>();
  private lastPush = new Map<string, ProtocolQuote>();
  private quoteRefs = new Map<string, number>();
  private listeners = new Set<QuoteListener>();
  private candleRefs = new Map<string, number>();
  private candleListeners = new Map<string, Set<CandleListener>>();
  private prevCloseTimer: ReturnType<typeof setInterval> | null = null;
  private prevCloseRetryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(deps: LongbridgeStreamDeps = {}) {
    this.socket = deps.socket ?? getSharedQuoteSocket();
    this.aggregator = new CandleAggregator((bar) => this.dispatchCandle(bar));
    this.socket.onQuote((quote) => {
      this.handleQuotePush(quote);
      this.aggregator.handleQuote(quote);
    });
    this.socket.onTrade((trade) => this.aggregator.handleTrades(trade));
  }

  private handleQuotePush(quote: ProtocolQuote): void {
    if (quote.tag === 1) return;
    this.lastPush.set(quote.symbol, quote);
    const cell = this.buildCell(quote);
    if (cell.pct === null) this.schedulePrevCloseRetry();
    this.snapshots.set(quote.symbol, cell);
    for (const listener of this.listeners) listener(cell);
  }

  private buildCell(quote: ProtocolQuote): QuoteCell {
    const prev = this.prevCloseCache.get(quote.symbol);
    let prevClose = prev?.regular ?? 0;
    if (quote.tradeSession === TRADE_SESSION_PRE) prevClose = prev?.pre || prevClose;
    else if (quote.tradeSession === TRADE_SESSION_POST) prevClose = prev?.post || prevClose;
    else if (quote.tradeSession === TRADE_SESSION_OVERNIGHT)
      prevClose = prev?.overnight || prevClose;
    const pct = pctOf(quote.lastDone, prevClose);
    if (quote.tradeSession === 0) this.lastRegular.set(quote.symbol, { last: quote.lastDone, pct });
    const regular = this.lastRegular.get(quote.symbol);
    const labelTs = quote.timestamp > 0 ? quote.timestamp : Math.floor(Date.now() / 1000);
    const market = marketOf(quote.symbol);
    return {
      symbol: quote.symbol,
      session: sessionLabel(classifySession(labelTs, market), market),
      last: quote.lastDone,
      pct,
      regularLast: regular?.last ?? quote.lastDone,
      regularPct: regular?.pct ?? pct,
      ...(quote.timestamp > 0 ? { asOf: new Date(quote.timestamp * 1000).toISOString() } : {}),
    };
  }

  private async refreshSnapshots(symbols: string[]): Promise<void> {
    if (!symbols.length) return;
    const rows = await getProvider().getQuotes(symbols);
    const now = Date.now();
    for (const row of rows) {
      const regular = Number(row.prev_close);
      const last = Number(row.last);
      this.prevCloseCache.set(row.symbol, {
        regular,
        pre: extendedLast(row.pre_market, regular),
        post: extendedLast(row.post_market, regular),
        overnight: extendedLast(row.overnight, regular),
        fetchedAt: now,
      });
      const regularCell = { last, pct: pctOf(last, regular) };
      this.lastRegular.set(row.symbol, regularCell);
      const snapshot = this.snapshots.get(row.symbol);
      if (!snapshot) {
        this.snapshots.set(row.symbol, {
          symbol: row.symbol,
          session: '日盘',
          last,
          pct: regularCell.pct,
          regularLast: last,
          regularPct: regularCell.pct,
        });
      } else if (snapshot.pct === null) {
        const push = this.lastPush.get(row.symbol);
        if (push) {
          const cell = this.buildCell(push);
          this.snapshots.set(row.symbol, cell);
          for (const listener of this.listeners) listener(cell);
        }
      }
    }
  }

  async retain(symbols: string[]): Promise<void> {
    const fresh: string[] = [];
    for (const symbol of symbols) {
      const count = (this.quoteRefs.get(symbol) ?? 0) + 1;
      this.quoteRefs.set(symbol, count);
      if (count === 1) fresh.push(symbol);
    }
    if (!fresh.length) return;
    this.startPrevCloseTimer();
    const [subscribed, refreshed] = await Promise.allSettled([
      this.socket.subscribe(fresh, [SUB_TYPE_QUOTE]),
      this.refreshSnapshots(fresh),
    ]);
    if (refreshed.status === 'rejected') {
      const reason =
        refreshed.reason instanceof Error ? refreshed.reason.message : String(refreshed.reason);
      console.warn('[longbridge-stream] prev-close snapshot failed, will retry:', reason);
      this.schedulePrevCloseRetry();
    }
    if (subscribed.status === 'rejected') throw subscribed.reason;
  }

  private startPrevCloseTimer(): void {
    if (this.prevCloseTimer) return;
    this.prevCloseTimer = setInterval(
      () => void this.refreshSnapshots([...this.quoteRefs.keys()]).catch(() => {}),
      PREV_CLOSE_TTL_MS,
    );
  }

  private schedulePrevCloseRetry(): void {
    if (this.prevCloseRetryTimer) return;
    this.prevCloseRetryTimer = setTimeout(() => {
      this.prevCloseRetryTimer = null;
      const missing = [...this.quoteRefs.keys()].filter(
        (symbol) => !this.prevCloseCache.has(symbol),
      );
      if (!missing.length) return;
      void this.refreshSnapshots(missing).catch(() => this.schedulePrevCloseRetry());
    }, PREV_CLOSE_RETRY_MS);
  }

  async release(symbols: string[]): Promise<void> {
    const drop: string[] = [];
    for (const symbol of symbols) {
      const count = (this.quoteRefs.get(symbol) ?? 0) - 1;
      if (count <= 0) {
        this.quoteRefs.delete(symbol);
        if (!this.hasCandleForSymbol(symbol)) drop.push(symbol);
      } else {
        this.quoteRefs.set(symbol, count);
      }
    }
    if (drop.length) await this.socket.unsubscribe(drop, [SUB_TYPE_QUOTE]);
    for (const symbol of drop) {
      this.snapshots.delete(symbol);
      this.prevCloseCache.delete(symbol);
      this.lastRegular.delete(symbol);
      this.lastPush.delete(symbol);
    }
    if (this.quoteRefs.size === 0) {
      if (this.prevCloseTimer) {
        clearInterval(this.prevCloseTimer);
        this.prevCloseTimer = null;
      }
      if (this.prevCloseRetryTimer) {
        clearTimeout(this.prevCloseRetryTimer);
        this.prevCloseRetryTimer = null;
      }
    }
  }

  subscribeCandlesticks(symbol: string, period: CandlePeriod, cb: CandleListener): () => void {
    const key = candleKey(symbol, period);
    const count = (this.candleRefs.get(key) ?? 0) + 1;
    this.candleRefs.set(key, count);
    const listeners = this.candleListeners.get(key) ?? new Set<CandleListener>();
    listeners.add(cb);
    this.candleListeners.set(key, listeners);
    if (count === 1) void this.activateCandle(symbol, period);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      listeners.delete(cb);
      const next = (this.candleRefs.get(key) ?? 0) - 1;
      if (next <= 0) {
        this.candleRefs.delete(key);
        this.candleListeners.delete(key);
        this.aggregator.remove(symbol, period);
        if (!this.hasCandleForSymbol(symbol)) {
          const types = this.quoteRefs.has(symbol)
            ? [SUB_TYPE_TRADE]
            : [SUB_TYPE_QUOTE, SUB_TYPE_TRADE];
          void this.socket.unsubscribe([symbol], types).catch(() => {});
        }
      } else {
        this.candleRefs.set(key, next);
      }
    };
  }

  private async activateCandle(symbol: string, period: CandlePeriod): Promise<void> {
    try {
      const cliPeriod = period === '60m' ? '1h' : period;
      const rows = await getProvider().getKline(symbol, cliPeriod, 2, 'all');
      const last = rows.at(-1);
      if (last) this.aggregator.seed(symbol, period, last);
      await this.socket.subscribe([symbol], [SUB_TYPE_QUOTE, SUB_TYPE_TRADE]);
    } catch (error) {
      console.warn('[longbridge-stream] candlestick subscribe failed', symbol, period, error);
    }
  }

  private hasCandleForSymbol(symbol: string): boolean {
    for (const key of this.candleRefs.keys()) if (key.startsWith(`${symbol}\0`)) return true;
    return false;
  }

  private dispatchCandle(bar: CandleBar): void {
    for (const listener of this.candleListeners.get(candleKey(bar.symbol, bar.period)) ?? []) {
      try {
        listener(bar);
      } catch (error) {
        console.warn('[longbridge-stream] candlestick listener failed', error);
      }
    }
  }

  onUpdate(listener: QuoteListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(symbol: string): QuoteCell | undefined {
    return this.snapshots.get(symbol);
  }

  getSnapshots(symbols: string[]): QuoteCell[] {
    return symbols.flatMap((symbol) => {
      const snapshot = this.snapshots.get(symbol);
      return snapshot ? [snapshot] : [];
    });
  }

  dispose(): void {
    if (this.prevCloseTimer) {
      clearInterval(this.prevCloseTimer);
      this.prevCloseTimer = null;
    }
    if (this.prevCloseRetryTimer) {
      clearTimeout(this.prevCloseRetryTimer);
      this.prevCloseRetryTimer = null;
    }
  }
}

let instance: LongbridgeStream | null = null;

export function getLongbridgeStream(): LongbridgeStream {
  if (!instance) instance = new LongbridgeStream();
  return instance;
}

export function resetLongbridgeStream(): void {
  instance?.dispose();
  instance = null;
}
