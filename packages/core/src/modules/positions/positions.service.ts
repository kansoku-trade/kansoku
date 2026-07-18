import type { PortfolioSummary } from "@kansoku/shared/types";
import type { PositionsApi } from "../../contract/positions.js";
import { ClientError } from "../../errors.js";
import { getProvider } from "../../services/marketdata/registry.js";
import { summarizePortfolio } from "./positions.utils.js";

const CACHE_TTL_MS = 30_000;

export function createPositionsService(): PositionsApi {
  let cache: { at: number; data: PortfolioSummary } | null = null;

  return {
    async list() {
      if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
        return cache.data;
      }
      const provider = getProvider();
      if (!provider.getPortfolio) {
        throw new ClientError(`provider ${provider.name} does not support portfolio`, undefined, 501);
      }
      const data = summarizePortfolio(await provider.getPortfolio());
      cache = { at: Date.now(), data };
      return data;
    },
  };
}
