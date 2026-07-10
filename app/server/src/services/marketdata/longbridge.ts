import { execFile } from "node:child_process";
import { AdjustType, Market, NaiveDate, NaiveDatetime, Time, TradeSessions } from "longbridge";
import type {
  AccountBalance,
  CapitalDistributionResponse,
  CapitalFlowLine,
  Candlestick,
  Period,
  PrePostQuote,
  SecurityQuote,
  StockPositionsResponse,
  WatchlistGroup,
} from "longbridge";
import type { NewsItem, RawBar } from "../../../../shared/types.js";
import { ClientError } from "../../errors.js";
import { clearCredentialRejection, recordCredentialRejection } from "../credentials/credentialStatus.js";
import { NoCredentialsError } from "../credentials/errors.js";
import type { FlowRow } from "../simple.js";
import { CANDLE_PERIOD_MAP, type CandlePeriod } from "./candlestickLedger.js";
import { getLongbridgeStream } from "./longbridgeStream.js";
import type { MarketDataProvider, RawCapitalDistribution, RawPortfolio, RawPosition, RawQuote } from "./types.js";

const NEWS_TIMEOUT_MS = 60_000;
const THROTTLE_MIN_INTERVAL_MS = 100;
const MAX_HISTORY_PAGES = 5;
// Longbridge rejects kline requests above 1000 bars per call (code 301607).
const KLINE_PAGE_SIZE = 1000;
// Heuristic over the SDK's opaque native error message — same pattern as
// settingsValidation.categorizeTestError for AI provider auth errors.
const CREDENTIALS_REJECTED_RE = /token.*(expired|invalid|revoked)|invalid.*(access.?token|token)|unauthori[sz]ed|401\d{3}/i;

const LEGACY_PERIOD_ALIASES: Record<string, CandlePeriod> = { "1h": "60m" };

function normalizePeriod(period: string): CandlePeriod {
  const canonical = (LEGACY_PERIOD_ALIASES[period] ?? period) as CandlePeriod;
  if (!(canonical in CANDLE_PERIOD_MAP)) {
    throw new ClientError(
      `getKline: unsupported period "${period}"`,
      `supported periods: ${Object.keys(CANDLE_PERIOD_MAP).join(", ")} (aliases: ${Object.keys(LEGACY_PERIOD_ALIASES).join(", ")})`,
    );
  }
  return canonical;
}

function roundPct(pct: number): number {
  return Math.round(pct * 1e6) / 1e6;
}

function sessionToTradeSessions(session?: string): TradeSessions {
  return session === "all" ? TradeSessions.All : TradeSessions.Intraday;
}

function toNaiveDatetime(d: Date): NaiveDatetime {
  return new NaiveDatetime(
    new NaiveDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()),
    new Time(d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()),
  );
}

function barFrom(c: Candlestick): RawBar {
  return {
    time: c.timestamp.toISOString(),
    open: c.open.toNumber(),
    high: c.high.toNumber(),
    low: c.low.toNumber(),
    close: c.close.toNumber(),
    volume: c.volume,
  };
}

let nextSlot = 0;
function throttle(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + THROTTLE_MIN_INTERVAL_MS;
  return wait > 0 ? new Promise((resolve) => setTimeout(resolve, wait)) : Promise.resolve();
}

async function callSdk<T>(label: string, fn: () => Promise<T>): Promise<T> {
  await throttle();
  try {
    const result = await fn();
    clearCredentialRejection();
    return result;
  } catch (err) {
    if (err instanceof ClientError) throw err;
    if (err instanceof NoCredentialsError) {
      throw new ClientError(
        err.message,
        "Configure Longbridge credentials (LONGBRIDGE_APP_KEY/APP_SECRET/ACCESS_TOKEN, or via the host's credential provider) before calling market-data endpoints.",
        503,
        "NO_CREDENTIALS",
      );
    }
    const detail = err instanceof Error ? err.message : String(err);
    if (CREDENTIALS_REJECTED_RE.test(detail)) {
      const message = `longbridge ${label} failed: ${detail}`;
      recordCredentialRejection(message);
      throw new ClientError(
        message,
        "Longbridge rejected the configured credentials (expired or invalid token) — update them and retry.",
        503,
        "CREDENTIALS_REJECTED",
      );
    }
    throw new ClientError(
      `longbridge ${label} failed: ${detail}`,
      "Check Longbridge OAuth/API-key credentials in .env (LONGBRIDGE_OAUTH_CLIENT_ID or LONGBRIDGE_APP_KEY/SECRET/ACCESS_TOKEN) and the symbol format (e.g. NVDA.US).",
      502,
    );
  }
}

export interface QuotePort {
  candlesticks(
    symbol: string,
    period: Period,
    count: number,
    adjustType: AdjustType,
    tradeSessions: TradeSessions,
  ): Promise<Candlestick[]>;
  historyCandlesticksByOffset(
    symbol: string,
    period: Period,
    adjustType: AdjustType,
    forward: boolean,
    datetime: NaiveDatetime | undefined | null,
    count: number,
    tradeSessions: TradeSessions,
  ): Promise<Candlestick[]>;
  quote(symbols: string[]): Promise<SecurityQuote[]>;
  capitalFlow(symbol: string): Promise<CapitalFlowLine[]>;
  capitalDistribution(symbol: string): Promise<CapitalDistributionResponse>;
  watchlist(): Promise<WatchlistGroup[]>;
}

export interface TradePort {
  stockPositions(symbols?: string[] | null): Promise<StockPositionsResponse>;
  accountBalance(currency?: string | null): Promise<AccountBalance[]>;
}

async function defaultGetQuotePort(): Promise<QuotePort> {
  return getLongbridgeStream().getQuoteContext();
}

async function defaultGetTradePort(): Promise<TradePort> {
  return getLongbridgeStream().getTradeContext();
}

function execLongbridgeNews(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "longbridge",
      [...args, "--format", "json"],
      { maxBuffer: 32 * 1024 * 1024, timeout: NEWS_TIMEOUT_MS },
      (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout);
      },
    );
  });
}

interface RawNewsItem {
  id: string | number;
  title: string;
  published_at: string;
  url: string;
}

async function fetchCandles(
  port: QuotePort,
  symbol: string,
  period: Period,
  count: number,
  tradeSessions: TradeSessions,
): Promise<Candlestick[]> {
  let bars = await port.candlesticks(symbol, period, Math.min(count, KLINE_PAGE_SIZE), AdjustType.NoAdjust, tradeSessions);
  let pages = 0;
  const maxPages = Math.max(MAX_HISTORY_PAGES, Math.ceil(count / KLINE_PAGE_SIZE) + 2);
  while (bars.length < count && bars.length > 0 && pages < maxPages) {
    pages++;
    const earliest = bars[0];
    const more = await port.historyCandlesticksByOffset(
      symbol,
      period,
      AdjustType.NoAdjust,
      false,
      toNaiveDatetime(earliest.timestamp),
      Math.min(count - bars.length, KLINE_PAGE_SIZE),
      tradeSessions,
    );
    const older = more.filter((b) => b.timestamp.getTime() < earliest.timestamp.getTime());
    if (!older.length) break;
    bars = [...older, ...bars];
  }
  return bars.length > count ? bars.slice(bars.length - count) : bars;
}

const MARKET_LABEL: Record<Market, string> = {
  [Market.Unknown]: "Unknown",
  [Market.US]: "US",
  [Market.HK]: "HK",
  [Market.CN]: "CN",
  [Market.SG]: "SG",
  [Market.Crypto]: "Crypto",
};

function marketLabel(m: Market): string {
  return MARKET_LABEL[m] ?? "Unknown";
}

export function createLongbridgeProvider(
  getQuotePort: () => Promise<QuotePort> = defaultGetQuotePort,
  getTradePort: () => Promise<TradePort> = defaultGetTradePort,
): MarketDataProvider {
  return {
    name: "longbridge",
    capabilities: new Set(["flow", "capital-distribution", "positions", "watchlist", "portfolio"]),

    getKline(symbol: string, period: string, count: number, session?: string): Promise<RawBar[]> {
      return callSdk("kline", async () => {
        const candlePeriod = normalizePeriod(period);
        const sdkPeriod = CANDLE_PERIOD_MAP[candlePeriod];
        const tradeSessions = sessionToTradeSessions(session);
        const port = await getQuotePort();
        const bars = await fetchCandles(port, symbol, sdkPeriod, count, tradeSessions);
        return bars.map(barFrom);
      });
    },

    getQuotes(symbols: string[]): Promise<RawQuote[]> {
      return callSdk("quote", async () => {
        const port = await getQuotePort();
        const rows = await port.quote(symbols);
        return rows.map((row): RawQuote => {
          const last = row.lastDone.toNumber();
          const prevClose = row.prevClose.toNumber();
          const changePct = prevClose ? roundPct((last / prevClose - 1) * 100).toString() : "0";
          const extended = (q: PrePostQuote | null) =>
            q
              ? {
                  last: q.lastDone.toString(),
                  prev_close: q.prevClose.toString(),
                  timestamp: q.timestamp.toISOString(),
                }
              : undefined;
          return {
            symbol: row.symbol,
            last: row.lastDone.toString(),
            prev_close: row.prevClose.toString(),
            change_percentage: changePct,
            pre_market: extended(row.preMarketQuote),
            post_market: extended(row.postMarketQuote),
            overnight: extended(row.overnightQuote),
          };
        });
      });
    },

    async getNews(symbol: string, limit = 6): Promise<NewsItem[]> {
      try {
        const stdout = await execLongbridgeNews(["news", symbol, "--lang", "zh-CN"]);
        const items = JSON.parse(stdout) as RawNewsItem[];
        return items.slice(0, limit).map((n) => ({
          id: String(n.id),
          title: n.title,
          published_at: n.published_at,
          url: n.url,
        }));
      } catch {
        return [];
      }
    },

    getFlow(symbol: string): Promise<FlowRow[]> {
      return callSdk("capitalFlow", async () => {
        const port = await getQuotePort();
        const lines = await port.capitalFlow(symbol);
        return lines.map((l): FlowRow => ({ time: l.timestamp.toISOString(), inflow: l.inflow.toString() }));
      });
    },

    getCapitalDistribution(symbol: string): Promise<RawCapitalDistribution> {
      return callSdk("capitalDistribution", async () => {
        const port = await getQuotePort();
        const resp = await port.capitalDistribution(symbol);
        return {
          symbol,
          timestamp: resp.timestamp.toISOString(),
          capital_in: {
            large: resp.capitalIn.large.toString(),
            medium: resp.capitalIn.medium.toString(),
            small: resp.capitalIn.small.toString(),
          },
          capital_out: {
            large: resp.capitalOut.large.toString(),
            medium: resp.capitalOut.medium.toString(),
            small: resp.capitalOut.small.toString(),
          },
        };
      });
    },

    getPositions(): Promise<RawPosition[]> {
      return callSdk("stockPositions", async () => {
        const port = await getTradePort();
        const resp = await port.stockPositions();
        const out: RawPosition[] = [];
        for (const channel of resp.channels) {
          for (const p of channel.positions) {
            out.push({
              symbol: p.symbol,
              name: p.symbolName,
              currency: p.currency,
              quantity: p.quantity.toString(),
              available: p.availableQuantity.toString(),
              cost_price: p.costPrice.toString(),
              market: marketLabel(p.market),
            });
          }
        }
        return out;
      });
    },

    getPortfolio(): Promise<RawPortfolio> {
      return callSdk("portfolio", async () => {
        const tradePort = await getTradePort();
        const quotePort = await getQuotePort();
        const [positionsResp, balances] = await Promise.all([tradePort.stockPositions(), tradePort.accountBalance()]);

        const positions = positionsResp.channels.flatMap((c) => c.positions);
        const symbols = positions.map((p) => p.symbol);
        const quotes = symbols.length ? await quotePort.quote(symbols) : [];
        const quoteBySymbol = new Map(quotes.map((q) => [q.symbol, q]));

        const holdings = positions.map((p) => {
          const quote = quoteBySymbol.get(p.symbol);
          const quantity = p.quantity.toNumber();
          const costPrice = p.costPrice.toNumber();
          const marketPrice = quote?.lastDone.toNumber() ?? costPrice;
          const prevClose = quote?.prevClose.toNumber() ?? marketPrice;
          return {
            symbol: p.symbol,
            name: p.symbolName,
            currency: p.currency,
            quantity: quantity.toString(),
            cost_price: costPrice.toString(),
            market_price: marketPrice.toString(),
            market_value: (marketPrice * quantity).toString(),
            prev_close: prevClose.toString(),
          };
        });

        const totalPl = holdings.reduce((sum, h) => sum + (Number(h.market_price) - Number(h.cost_price)) * Number(h.quantity), 0);
        const totalTodayPl = holdings.reduce(
          (sum, h) => sum + (Number(h.market_price) - Number(h.prev_close)) * Number(h.quantity),
          0,
        );
        const marketCap = holdings.reduce((sum, h) => sum + Number(h.market_value), 0);
        const balance = balances.find((b) => b.currency === "USD") ?? balances[0];
        const totalCash = balance?.totalCash.toNumber() ?? 0;
        const currency = balance?.currency ?? holdings[0]?.currency ?? "USD";

        return {
          overview: {
            total_asset: (totalCash + marketCap).toString(),
            market_cap: marketCap.toString(),
            total_cash: totalCash.toString(),
            total_pl: totalPl.toString(),
            total_today_pl: totalTodayPl.toString(),
            currency,
          },
          holdings,
        };
      });
    },

    async getWatchlistSymbols(): Promise<string[]> {
      return callSdk("watchlist", async () => {
        const port = await getQuotePort();
        const groups = await port.watchlist();
        const out = new Set<string>();
        for (const g of groups) for (const s of g.securities) out.add(s.symbol);
        return [...out];
      });
    },
  };
}

export const longbridgeProvider: MarketDataProvider = createLongbridgeProvider();
