import type { FastifyPluginAsync } from "fastify";
import { ClientError } from "../errors.js";
import { summarizePortfolio } from "../modules/positions/positions.utils.js";
import { getProvider } from "../services/marketdata/registry.js";
import type { PortfolioSummary } from "../../../shared/types.js";

const CACHE_TTL_MS = 30_000;

export { summarizePortfolio };

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
