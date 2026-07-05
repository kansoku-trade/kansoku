import type { FastifyPluginAsync } from "fastify";
import type { PortfolioSummary } from "../../../shared/types.js";
import { ClientError } from "../errors.js";
import { getProvider } from "../services/marketdata/registry.js";
import type { RawPortfolio } from "../services/marketdata/types.js";

const CACHE_TTL_MS = 30_000;

function num(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function summarizePortfolio(raw: RawPortfolio): PortfolioSummary {
  return {
    currency: raw.overview.currency,
    total_asset: num(raw.overview.total_asset),
    market_cap: num(raw.overview.market_cap),
    cash: num(raw.overview.total_cash),
    total_pl: num(raw.overview.total_pl),
    today_pl: num(raw.overview.total_today_pl),
    positions: raw.holdings.map((h) => {
      const quantity = num(h.quantity);
      const cost = num(h.cost_price);
      const last = num(h.market_price);
      return {
        symbol: h.symbol,
        name: h.name,
        quantity,
        cost_price: cost,
        last,
        market_value: num(h.market_value),
        pnl: (last - cost) * quantity,
        pnl_pct: cost > 0 ? (last / cost - 1) * 100 : 0,
      };
    }),
  };
}

export const positionsRoute: FastifyPluginAsync = async (app) => {
  let cache: { at: number; data: PortfolioSummary } | null = null;

  app.get("/", async () => {
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
      return { ok: true, data: cache.data };
    }
    const provider = getProvider();
    if (!provider.getPortfolio) {
      throw new ClientError(`provider ${provider.name} does not support portfolio`, undefined, 501);
    }
    const data = summarizePortfolio(await provider.getPortfolio());
    cache = { at: Date.now(), data };
    return { ok: true, data };
  });
};
