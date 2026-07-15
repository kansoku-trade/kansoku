import type { MacroEventItem, NewsItem, RawBar } from "../../../../../shared/types.js";
import { ClientError } from "../../errors.js";
import { LongbridgeCliError, runLongbridgeJson } from "../longbridgeCli.js";
import { getSharedQuoteSocket } from "./sharedSocket.js";
import type { FlowRow } from "../simple.js";
import type { Market } from "../symbol.utils.js";
import type {
  EarningsCalendarEntry,
  MacroCalendarResult,
  MarketDataProvider,
  RawCapitalDistribution,
  RawPortfolio,
  RawPosition,
  RawQuote,
} from "./types.js";

export type LongbridgeRunner = <T>(args: string[]) => Promise<T>;

interface CliBar {
  time: string;
  open: string | number;
  high: string | number;
  low: string | number;
  close: string | number;
  volume: number;
}

interface CliNewsItem {
  id: string | number;
  title: string;
  published_at: string;
  url: string;
}

interface CliSecurityInfo {
  symbol?: string;
  name?: string;
}

interface CliWatchlistGroup {
  securities?: Array<{ symbol?: string } | string>;
}

interface CliCalendarInfo {
  counter_id?: string;
  content?: string;
  datetime?: string;
  star?: number;
  data_kv?: Array<{ type?: string; value?: string }>;
}

interface CliCalendarPayload {
  list?: Array<{ date?: string; infos?: CliCalendarInfo[] }>;
}

const MACRO_SUPPORTED_MARKETS = new Set<Market>(["US"]);

function calendarKv(info: CliCalendarInfo, type: string): string | null {
  const value = info.data_kv?.find((item) => item.type === type)?.value;
  return value && value !== "--" ? value : null;
}

const SUPPORTED_PERIODS = new Set(["1m", "5m", "15m", "30m", "1h", "day", "week", "month", "year"]);
const PERIOD_ALIASES: Record<string, string> = { "60m": "1h" };

function normalizePeriod(period: string): string {
  const normalized = PERIOD_ALIASES[period] ?? period;
  if (!SUPPORTED_PERIODS.has(normalized)) {
    throw new ClientError(
      `getKline: unsupported period "${period}"`,
      `supported periods: ${[...SUPPORTED_PERIODS].join(", ")} (aliases: ${Object.keys(PERIOD_ALIASES).join(", ")})`,
    );
  }
  return normalized;
}

function number(value: string | number): number {
  return typeof value === "number" ? value : Number(value);
}

async function callCli<T>(label: string, run: LongbridgeRunner, args: string[]): Promise<T> {
  try {
    return await run<T>(args);
  } catch (error) {
    if (error instanceof ClientError) throw error;
    const detail =
      error instanceof LongbridgeCliError && error.detail
        ? `${error.message}（${error.detail}）`
        : error instanceof Error
          ? error.message
          : String(error);
    throw new ClientError(
      `longbridge ${label} failed: ${detail}`,
      "请确认已安装 longbridge CLI，并执行 longbridge auth login 完成登录。",
      502,
    );
  }
}

export interface QuoteQueryTransport {
  queryQuotes(symbols: string[]): Promise<RawQuote[]>;
  queryCandlesticks(symbol: string, period: string, count: number, session: "intraday" | "all"): Promise<RawBar[]>;
  queryCapitalFlow(symbol: string): Promise<FlowRow[]>;
  queryCapitalDistribution(symbol: string): Promise<RawCapitalDistribution>;
  queryStaticNames(symbols: string[]): Promise<Array<{ symbol: string; name: string }>>;
}

export function createLongbridgeProvider(
  run: LongbridgeRunner = runLongbridgeJson,
  socket?: () => QuoteQueryTransport,
): MarketDataProvider {
  const securityNameCache = new Map<string, Promise<string | null>>();

  async function wsFirst<T>(label: string, viaSocket: () => Promise<T>, viaCli: () => Promise<T>): Promise<T> {
    if (!socket) return viaCli();
    try {
      return await viaSocket();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[longbridge] ws ${label} failed, falling back to CLI:`, message);
      return viaCli();
    }
  }

  return {
    name: "longbridge",
    capabilities: new Set([
      "flow",
      "capital-distribution",
      "positions",
      "watchlist",
      "portfolio",
      "earnings-calendar",
      "macro-calendar",
    ]),

    async getKline(symbol: string, period: string, count: number, session?: string): Promise<RawBar[]> {
      const normalized = normalizePeriod(period);
      return wsFirst(
        "kline",
        () => socket!().queryCandlesticks(symbol, normalized, count, session === "all" ? "all" : "intraday"),
        async () => {
          const args = ["kline", symbol, "--period", normalized, "--count", String(count)];
          if (session === "all") args.push("--session", "all");
          const rows = await callCli<CliBar[]>("kline", run, args);
          return rows.map((row) => ({
            time: row.time,
            open: number(row.open),
            high: number(row.high),
            low: number(row.low),
            close: number(row.close),
            volume: row.volume,
          }));
        },
      );
    },

    getQuotes(symbols: string[]): Promise<RawQuote[]> {
      if (!symbols.length) return Promise.resolve([]);
      return wsFirst(
        "quote",
        () => socket!().queryQuotes(symbols),
        () => callCli<RawQuote[]>("quote", run, ["quote", ...symbols]),
      );
    },

    getSecurityName(symbol: string): Promise<string | null> {
      const key = symbol.toUpperCase();
      const cached = securityNameCache.get(key);
      if (cached) return cached;

      const request = wsFirst<CliSecurityInfo[]>(
        "static",
        () => socket!().queryStaticNames([symbol]),
        () => run<CliSecurityInfo[]>(["static", symbol, "--lang", "zh-CN"]),
      )
        .then((rows) => {
          const exact = rows.find((row) => row.symbol?.toUpperCase() === key) ?? rows[0];
          const name = exact?.name?.trim();
          return name || null;
        })
        .catch(() => null);
      securityNameCache.set(key, request);
      void request.then((name) => {
        if (!name && securityNameCache.get(key) === request) securityNameCache.delete(key);
      });
      return request;
    },

    async getNews(symbol: string, limit = 6): Promise<NewsItem[]> {
      try {
        const rows = await run<CliNewsItem[]>(["news", symbol, "--lang", "zh-CN"]);
        return rows.slice(0, limit).map((row) => ({
          id: String(row.id),
          title: row.title,
          published_at: row.published_at,
          url: row.url,
        }));
      } catch {
        return [];
      }
    },

    getFlow(symbol: string): Promise<FlowRow[]> {
      return wsFirst(
        "capital flow",
        () => socket!().queryCapitalFlow(symbol),
        () => callCli<FlowRow[]>("capital flow", run, ["capital", symbol, "--flow"]),
      );
    },

    getCapitalDistribution(symbol: string): Promise<RawCapitalDistribution> {
      return wsFirst(
        "capital distribution",
        () => socket!().queryCapitalDistribution(symbol),
        () => callCli<RawCapitalDistribution>("capital distribution", run, ["capital", symbol]),
      );
    },

    getPositions(): Promise<RawPosition[]> {
      return callCli<RawPosition[]>("positions", run, ["positions"]);
    },

    async getPortfolio(): Promise<RawPortfolio> {
      const result = await callCli<RawPortfolio>("portfolio", run, ["portfolio"]);
      return {
        overview: result.overview,
        holdings: result.holdings.map((holding) => ({
          symbol: holding.symbol,
          name: holding.name,
          currency: holding.currency,
          quantity: holding.quantity,
          cost_price: holding.cost_price,
          market_price: holding.market_price,
          market_value: holding.market_value,
          prev_close: holding.prev_close,
        })),
      };
    },

    async getWatchlistSymbols(): Promise<string[]> {
      const groups = await callCli<CliWatchlistGroup[]>("watchlist", run, ["watchlist"]);
      const symbols = new Set<string>();
      for (const group of groups) {
        for (const item of group.securities ?? []) {
          const symbol = typeof item === "string" ? item : item.symbol;
          if (symbol) symbols.add(symbol);
        }
      }
      return [...symbols];
    },

    async getEarningsCalendar(symbol: string, fromDate: string): Promise<EarningsCalendarEntry | null> {
      const payload = await callCli<CliCalendarPayload>("finance calendar report", run, [
        "finance-calendar",
        "report",
        "--symbol",
        symbol,
      ]);
      for (const day of payload.list ?? []) {
        if (!day.date || day.date < fromDate) continue;
        const info = day.infos?.find((item) => !item.counter_id || item.counter_id === symbol) ?? day.infos?.[0];
        if (info?.content) return { date: day.date, title: info.content };
      }
      return null;
    },

    async getMacroCalendar(
      market: Market,
      startDate: string,
      endDate: string,
      minStar: number,
    ): Promise<MacroCalendarResult> {
      if (!MACRO_SUPPORTED_MARKETS.has(market)) return { supported: false };
      const payload = await callCli<CliCalendarPayload>("finance calendar macrodata", run, [
        "finance-calendar",
        "macrodata",
        "--market",
        market,
        "--star",
        String(minStar),
        "--start",
        startDate,
        "--end",
        endDate,
      ]);
      const items: MacroEventItem[] = [];
      for (const day of payload.list ?? []) {
        for (const info of day.infos ?? []) {
          const epoch = Number(info.datetime);
          if (!info.content || !Number.isFinite(epoch) || (info.star ?? 0) < minStar) continue;
          items.push({
            ts: new Date(epoch * 1000).toISOString(),
            title: info.content,
            estimate: calendarKv(info, "estimate"),
            previous: calendarKv(info, "previous"),
          });
        }
      }
      return { supported: true, items };
    },
  };
}

export const longbridgeProvider: MarketDataProvider = createLongbridgeProvider(runLongbridgeJson, getSharedQuoteSocket);
