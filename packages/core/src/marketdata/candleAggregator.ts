import type { RawBar } from '@kansoku/shared/types';
import { classifySession } from './session.js';
import { marketOf } from '../symbols/symbol.utils.js';
import type { ProtocolQuote, ProtocolTradePush } from './longbridgeProtocol.js';

export type CandlePeriod = '5m' | '15m' | '60m';

export type CandleBar = {
  symbol: string;
  period: CandlePeriod;
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number;
};

const PERIOD_MS: Record<CandlePeriod, number> = {
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '60m': 60 * 60_000,
};

function key(symbol: string, period: CandlePeriod): string {
  return `${symbol}\0${period}`;
}

function isTradeableAt(symbol: string, tsMs: number): boolean {
  const market = marketOf(symbol);
  if (market === 'US') return true;
  return classifySession(Math.floor(tsMs / 1000), market) === 'regular';
}

function fromRaw(symbol: string, period: CandlePeriod, raw: RawBar): CandleBar {
  return {
    symbol,
    period,
    ts: Date.parse(raw.time),
    open: Number(raw.open),
    high: Number(raw.high),
    low: Number(raw.low),
    close: Number(raw.close),
    volume: Number(raw.volume),
    turnover: 0,
  };
}

export class CandleAggregator {
  private bars = new Map<string, CandleBar>();
  private periodsBySymbol = new Map<string, Set<CandlePeriod>>();

  constructor(private readonly emit: (bar: CandleBar) => void) {}

  seed(symbol: string, period: CandlePeriod, raw: RawBar): void {
    this.bars.set(key(symbol, period), fromRaw(symbol, period, raw));
    const periods = this.periodsBySymbol.get(symbol) ?? new Set<CandlePeriod>();
    periods.add(period);
    this.periodsBySymbol.set(symbol, periods);
  }

  remove(symbol: string, period: CandlePeriod): void {
    this.bars.delete(key(symbol, period));
    const periods = this.periodsBySymbol.get(symbol);
    periods?.delete(period);
    if (periods?.size === 0) this.periodsBySymbol.delete(symbol);
  }

  handleTrades(push: ProtocolTradePush): void {
    const periods = this.periodsBySymbol.get(push.symbol);
    if (!periods) return;
    for (const trade of push.trades) {
      if (!Number.isFinite(trade.price) || trade.price <= 0 || trade.volume < 0) continue;
      const timestamp = trade.timestamp * 1000;
      if (!isTradeableAt(push.symbol, timestamp)) continue;
      for (const period of periods) {
        const itemKey = key(push.symbol, period);
        const current = this.bars.get(itemKey);
        if (!current) continue;
        const duration = PERIOD_MS[period];
        if (timestamp < current.ts) continue;
        if (timestamp >= current.ts + duration) {
          const steps = Math.floor((timestamp - current.ts) / duration);
          const next: CandleBar = {
            symbol: push.symbol,
            period,
            ts: current.ts + steps * duration,
            open: trade.price,
            high: trade.price,
            low: trade.price,
            close: trade.price,
            volume: trade.volume,
            turnover: trade.price * trade.volume,
          };
          this.bars.set(itemKey, next);
          this.emit(next);
        } else {
          const next: CandleBar = {
            ...current,
            high: Math.max(current.high, trade.price),
            low: Math.min(current.low, trade.price),
            close: trade.price,
            volume: current.volume + trade.volume,
            turnover: current.turnover + trade.price * trade.volume,
          };
          this.bars.set(itemKey, next);
          this.emit(next);
        }
      }
    }
  }

  handleQuote(quote: ProtocolQuote): void {
    const periods = this.periodsBySymbol.get(quote.symbol);
    if (!periods || !Number.isFinite(quote.lastDone) || quote.lastDone <= 0) return;
    const timestamp = quote.timestamp * 1000;
    if (!isTradeableAt(quote.symbol, timestamp)) return;
    for (const period of periods) {
      const itemKey = key(quote.symbol, period);
      const current = this.bars.get(itemKey);
      if (!current || timestamp < current.ts || timestamp >= current.ts + PERIOD_MS[period])
        continue;
      const next = {
        ...current,
        high: Math.max(current.high, quote.lastDone),
        low: Math.min(current.low, quote.lastDone),
        close: quote.lastDone,
      };
      this.bars.set(itemKey, next);
      this.emit(next);
    }
  }
}
