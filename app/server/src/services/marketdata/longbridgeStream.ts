import { QuoteContext, SubType, TradeContext, TradeSession } from "longbridge";
import type { Config, PushQuote, PushQuoteEvent, PushCandlestickEvent } from "longbridge";
import type { QuoteCell } from "../../../../shared/types.js";
import { getCredentialProvider } from "../credentials/registry.js";
import { CandlestickLedger, periodToCandlePeriod, type CandleBar, type CandlePeriod } from "./candlestickLedger.js";
import { resolveLongbridgeConfig } from "./longbridgeConfig.js";

export type { CandleBar, CandlePeriod };

const PREV_CLOSE_TTL_MS = 30 * 60_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 60_000;

type PrevCloseCache = {
  regular: number;
  pre: number;
  post: number;
  overnight: number;
  fetchedAt: number;
};

type StreamListener = (cell: QuoteCell) => void;

function sessionLabel(s: TradeSession): string {
  switch (s) {
    case TradeSession.Pre:
      return "盘前";
    case TradeSession.Post:
      return "盘后";
    case TradeSession.Overnight:
      return "隔夜";
    default:
      return "日盘";
  }
}

function pctOf(last: number, prev: number): number {
  return prev ? (last / prev - 1) * 100 : 0;
}

class LongbridgeStream {
  private ctx: QuoteContext | null = null;
  private connectPromise: Promise<QuoteContext> | null = null;
  private reconnectAttempt = 0;

  private tradeCtx: TradeContext | null = null;
  private tradeConnectPromise: Promise<TradeContext> | null = null;

  private snapshots = new Map<string, QuoteCell>();
  private prevCloseCache = new Map<string, PrevCloseCache>();
  private lastRegular = new Map<string, { last: number; pct: number }>();
  private refCounts = new Map<string, number>();
  private subscribed = new Set<string>();
  private listeners = new Set<StreamListener>();
  private prevCloseTimer: ReturnType<typeof setInterval> | null = null;
  private candlestickLedger = new CandlestickLedger(() => this.connect());

  constructor() {
    // Binds to the provider INSTANCE active right now, not "whatever the
    // registry holds later" — swapping in a new provider object via
    // initCredentialProvider() after this point orphans this subscription.
    // Hosts that need runtime credential updates must keep one long-lived
    // provider and notify through it (its own onChange callback), not
    // replace the provider object.
    getCredentialProvider().onChange(() => this.resetClients());
  }

  private buildConfig(): Promise<Config> {
    return resolveLongbridgeConfig();
  }

  private resetClients(): void {
    this.ctx = null;
    this.connectPromise = null;
    this.tradeCtx = null;
    this.tradeConnectPromise = null;
  }

  private async connect(): Promise<QuoteContext> {
    if (this.ctx) return this.ctx;
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = (async () => {
      const config = await this.buildConfig();
      const ctx = await QuoteContext.new(config);
      ctx.setOnQuote((err, event) => {
        if (err) {
          console.warn("[longbridge-stream] onQuote error", err.message);
          return;
        }
        this.handlePush(event);
      });
      ctx.setOnCandlestick((err, event) => {
        if (err) {
          console.warn("[longbridge-stream] onCandlestick error", err.message);
          return;
        }
        this.handleCandlestickPush(event);
      });
      this.ctx = ctx;
      this.reconnectAttempt = 0;
      if (!this.prevCloseTimer) {
        this.prevCloseTimer = setInterval(() => {
          void this.refreshPrevClose([...this.subscribed]).catch((e) => {
            console.warn("[longbridge-stream] prev_close refresh failed", e);
          });
        }, PREV_CLOSE_TTL_MS);
      }
      if (this.subscribed.size) {
        const syms = [...this.subscribed];
        await ctx.subscribe(syms, [SubType.Quote]);
        await this.refreshPrevClose(syms).catch(() => {});
      }
      await this.candlestickLedger.resubscribeAll();
      return ctx;
    })();
    try {
      return await this.connectPromise;
    } catch (err) {
      this.connectPromise = null;
      console.warn("[longbridge-stream] connect failed:", err instanceof Error ? err.message : err);
      this.scheduleReconnect();
      throw err;
    }
  }

  private scheduleReconnect(): void {
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    console.warn(`[longbridge-stream] reconnect in ${delay}ms`);
    setTimeout(() => {
      this.ctx = null;
      void this.connect().catch(() => {});
    }, delay);
  }

  private handlePush(event: PushQuoteEvent): void {
    const symbol = event.symbol;
    const data: PushQuote = event.data;
    const session = data.tradeSession;
    const last = data.lastDone.toNumber();
    const prev = this.prevCloseCache.get(symbol);
    let prevClose = 0;
    if (prev) {
      switch (session) {
        case TradeSession.Pre:
          prevClose = prev.pre || prev.regular;
          break;
        case TradeSession.Post:
          prevClose = prev.post || prev.regular;
          break;
        case TradeSession.Overnight:
          prevClose = prev.overnight || prev.regular;
          break;
        default:
          prevClose = prev.regular;
      }
    }
    const pct = pctOf(last, prevClose);
    if (session === TradeSession.Intraday) {
      this.lastRegular.set(symbol, { last, pct });
    }
    const regular = this.lastRegular.get(symbol);
    const cell: QuoteCell = {
      symbol,
      session: sessionLabel(session),
      last,
      pct,
      regularLast: regular?.last ?? last,
      regularPct: regular?.pct ?? pct,
    };
    this.snapshots.set(symbol, cell);
    for (const listener of this.listeners) listener(cell);
  }

  private handleCandlestickPush(event: PushCandlestickEvent): void {
    const period = periodToCandlePeriod(event.data.period);
    if (!period) return;
    const c = event.data.candlestick;
    const bar: CandleBar = {
      symbol: event.symbol,
      period,
      ts: c.timestamp.getTime(),
      open: c.open.toNumber(),
      high: c.high.toNumber(),
      low: c.low.toNumber(),
      close: c.close.toNumber(),
      volume: c.volume,
      turnover: c.turnover.toNumber(),
    };
    this.candlestickLedger.dispatch(event.symbol, period, bar);
  }

  subscribeCandlesticks(symbol: string, period: CandlePeriod, cb: (bar: CandleBar) => void): () => void {
    return this.candlestickLedger.subscribe(symbol, period, cb);
  }

  async getQuoteContext(): Promise<QuoteContext> {
    return this.connect();
  }

  async getTradeContext(): Promise<TradeContext> {
    if (this.tradeCtx) return this.tradeCtx;
    if (this.tradeConnectPromise) return this.tradeConnectPromise;
    this.tradeConnectPromise = (async () => {
      const config = await this.buildConfig();
      const ctx = await TradeContext.new(config);
      this.tradeCtx = ctx;
      return ctx;
    })();
    try {
      return await this.tradeConnectPromise;
    } catch (err) {
      this.tradeConnectPromise = null;
      console.warn("[longbridge-stream] trade connect failed:", err instanceof Error ? err.message : err);
      throw err;
    }
  }

  private async refreshPrevClose(symbols: string[]): Promise<void> {
    if (!symbols.length || !this.ctx) return;
    const rows = await this.ctx.quote(symbols);
    const now = Date.now();
    for (const row of rows) {
      const regular = row.prevClose.toNumber();
      const cached: PrevCloseCache = {
        regular,
        pre: row.preMarketQuote?.prevClose.toNumber() ?? regular,
        post: row.postMarketQuote?.prevClose.toNumber() ?? regular,
        overnight: row.overnightQuote?.prevClose.toNumber() ?? regular,
        fetchedAt: now,
      };
      this.prevCloseCache.set(row.symbol, cached);
      const last = row.lastDone.toNumber();
      if (!this.lastRegular.has(row.symbol)) {
        this.lastRegular.set(row.symbol, { last, pct: pctOf(last, regular) });
      }
      if (!this.snapshots.has(row.symbol)) {
        const reg = this.lastRegular.get(row.symbol)!;
        this.snapshots.set(row.symbol, {
          symbol: row.symbol,
          session: "日盘",
          last,
          pct: pctOf(last, regular),
          regularLast: reg.last,
          regularPct: reg.pct,
        });
      }
    }
  }

  async retain(symbols: string[]): Promise<void> {
    const fresh: string[] = [];
    for (const s of symbols) {
      const n = (this.refCounts.get(s) ?? 0) + 1;
      this.refCounts.set(s, n);
      if (!this.subscribed.has(s)) fresh.push(s);
    }
    if (!fresh.length) return;
    for (const s of fresh) this.subscribed.add(s);
    const ctx = await this.connect();
    await ctx.subscribe(fresh, [SubType.Quote]);
    await this.refreshPrevClose(fresh);
  }

  async release(symbols: string[]): Promise<void> {
    const drop: string[] = [];
    for (const s of symbols) {
      const n = (this.refCounts.get(s) ?? 0) - 1;
      if (n <= 0) {
        this.refCounts.delete(s);
        if (this.subscribed.delete(s)) drop.push(s);
      } else {
        this.refCounts.set(s, n);
      }
    }
    if (!drop.length || !this.ctx) return;
    try {
      await this.ctx.unsubscribe(drop, [SubType.Quote]);
    } catch (err) {
      console.warn("[longbridge-stream] unsubscribe failed", err);
    }
    for (const s of drop) {
      this.snapshots.delete(s);
      this.prevCloseCache.delete(s);
      this.lastRegular.delete(s);
    }
  }

  onUpdate(listener: StreamListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(symbol: string): QuoteCell | undefined {
    return this.snapshots.get(symbol);
  }

  getSnapshots(symbols: string[]): QuoteCell[] {
    const out: QuoteCell[] = [];
    for (const s of symbols) {
      const cell = this.snapshots.get(s);
      if (cell) out.push(cell);
    }
    return out;
  }
}

let instance: LongbridgeStream | null = null;

export function getLongbridgeStream(): LongbridgeStream {
  if (!instance) instance = new LongbridgeStream();
  return instance;
}

export { LongbridgeStream };
