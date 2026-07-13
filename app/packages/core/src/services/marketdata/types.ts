import type { NewsItem, RawBar } from "../../../../../shared/types.js";
import type { FlowRow } from "../simple.js";

export interface ExtendedQuote {
  last?: string;
  prev_close?: string;
  timestamp?: string;
}

export interface RawQuote {
  symbol: string;
  last: string;
  prev_close: string;
  change_percentage: string;
  pre_market?: ExtendedQuote;
  post_market?: ExtendedQuote;
  overnight?: ExtendedQuote;
}

export interface RawCapitalDistribution {
  capital_in: { large: string; medium: string; small: string };
  capital_out: { large: string; medium: string; small: string };
  symbol: string;
  timestamp: string;
}

export interface RawPosition {
  available: string;
  cost_price: string;
  currency: string;
  market: string;
  name: string;
  quantity: string;
  symbol: string;
}

export interface RawPortfolioHolding {
  symbol: string;
  name: string;
  currency: string;
  quantity: string;
  cost_price: string;
  market_price: string;
  market_value: string;
  prev_close: string;
}

export interface RawPortfolio {
  overview: {
    total_asset: string;
    market_cap: string;
    total_cash: string;
    total_pl: string;
    total_today_pl: string;
    currency: string;
  };
  holdings: RawPortfolioHolding[];
}

export type Capability = "flow" | "capital-distribution" | "positions" | "watchlist" | "portfolio";

export interface MarketDataProvider {
  readonly name: string;
  readonly capabilities: ReadonlySet<Capability>;
  getKline(symbol: string, period: string, count: number, session?: string): Promise<RawBar[]>;
  getQuotes(symbols: string[]): Promise<RawQuote[]>;
  getSecurityName?(symbol: string): Promise<string | null>;
  getNews(symbol: string, limit?: number): Promise<NewsItem[]>;
  getFlow?(symbol: string): Promise<FlowRow[]>;
  getCapitalDistribution?(symbol: string): Promise<RawCapitalDistribution>;
  getPositions?(): Promise<RawPosition[]>;
  getPortfolio?(): Promise<RawPortfolio>;
  getWatchlistSymbols?(): Promise<string[]>;
}
