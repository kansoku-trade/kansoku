import { execFile } from "node:child_process";
import type { NewsItem, RawBar } from "../../../../shared/types.js";
import { ClientError } from "../../errors.js";
import type { FlowRow } from "../simple.js";
import type { MarketDataProvider, RawCapitalDistribution, RawPosition, RawQuote } from "./types.js";

const FAILURE_COOLDOWN_MS = 120_000;

let queue: Promise<unknown> = Promise.resolve();
let lastFailureAt = 0;

function cooldownLeft(now = Date.now()): number {
  return Math.max(0, FAILURE_COOLDOWN_MS - (now - lastFailureAt));
}

function authHint(cooldownMs?: number): string {
  const prefix = cooldownMs
    ? `Longbridge CLI recently failed; suppressing new CLI launches for ${Math.ceil(cooldownMs / 1000)}s. `
    : "";
  return `${prefix}Check \`longbridge auth login\`, network, and the symbol format (e.g. NVDA.US).`;
}

function blockedError(args: string[]): ClientError {
  console.warn(`[longbridge] skip ${args.join(" ")} cooldown=${Math.ceil(cooldownLeft() / 1000)}s`);
  return new ClientError(
    `longbridge ${args.join(" ")} skipped after recent failure`,
    authHint(cooldownLeft()),
    502,
  );
}

function execLongbridge(args: string[]): Promise<string> {
  const startedAt = Date.now();
  console.log(`[longbridge] run ${args.join(" ")}`);
  return new Promise((resolve, reject) => {
    execFile(
      "longbridge",
      [...args, "--format", "json"],
      {
        maxBuffer: 32 * 1024 * 1024,
        timeout: 60_000,
      },
      (err, stdout) => {
        const ms = Date.now() - startedAt;
        if (err) {
          console.warn(`[longbridge] fail ${args.join(" ")} ${ms}ms: ${err.message}`);
          reject(err);
        } else {
          console.log(`[longbridge] ok ${args.join(" ")} ${ms}ms`);
          resolve(stdout);
        }
      },
    );
  });
}

async function longbridgeJson<T>(args: string[]): Promise<T> {
  if (cooldownLeft() > 0) throw blockedError(args);

  const run = async (): Promise<T> => {
    if (cooldownLeft() > 0) throw blockedError(args);

    let stdout: string;
    try {
      stdout = await execLongbridge(args);
    } catch (err) {
      lastFailureAt = Date.now();
      const detail = err instanceof Error ? err.message : String(err);
      throw new ClientError(
        `longbridge ${args.join(" ")} failed: ${detail}`,
        authHint(),
        502,
      );
    }
    try {
      return JSON.parse(stdout) as T;
    } catch {
      lastFailureAt = Date.now();
      console.warn(`[longbridge] non-json ${args.join(" ")}: ${stdout.slice(0, 120)}`);
      throw new ClientError(
        `longbridge ${args.join(" ")} returned non-JSON output`,
        stdout.slice(0, 200),
        502,
      );
    }
  };

  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}

interface RawNewsItem {
  id: string | number;
  title: string;
  published_at: string;
  url: string;
}

interface WatchlistGroup {
  securities?: { symbol: string }[];
}

export const longbridgeProvider: MarketDataProvider = {
  name: "longbridge",
  capabilities: new Set(["flow", "capital-distribution", "positions", "watchlist"]),

  getKline(symbol: string, period: string, count: number, session?: string): Promise<RawBar[]> {
    const args = ["kline", symbol, "--period", period, "--count", String(count)];
    if (session) args.push("--session", session);
    return longbridgeJson<RawBar[]>(args);
  },

  getQuotes(symbols: string[]): Promise<RawQuote[]> {
    return longbridgeJson<RawQuote[]>(["quote", ...symbols]);
  },

  async getNews(symbol: string, limit = 6): Promise<NewsItem[]> {
    try {
      const items = await longbridgeJson<RawNewsItem[]>(["news", symbol, "--lang", "zh-CN"]);
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
    return longbridgeJson<FlowRow[]>(["capital", symbol, "--flow"]);
  },

  getCapitalDistribution(symbol: string): Promise<RawCapitalDistribution> {
    return longbridgeJson<RawCapitalDistribution>(["capital", symbol]);
  },

  getPositions(): Promise<RawPosition[]> {
    return longbridgeJson<RawPosition[]>(["positions"]);
  },

  async getWatchlistSymbols(): Promise<string[]> {
    const groups = await longbridgeJson<WatchlistGroup[]>(["watchlist"]);
    const out = new Set<string>();
    for (const g of groups) for (const s of g.securities ?? []) out.add(s.symbol);
    return [...out];
  },
};
