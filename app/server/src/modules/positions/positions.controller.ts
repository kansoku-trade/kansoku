import { Controller, Get } from "@tsuki-hono/common";
import type { PortfolioSummary } from "../../../../shared/types.js";
import { ClientError } from "../../errors.js";
import { getProvider } from "../../services/marketdata/registry.js";
import { summarizePortfolio } from "./positions.utils.js";

const CACHE_TTL_MS = 30_000;

@Controller("positions")
export class PositionsController {
  private cache: { at: number; data: PortfolioSummary } | null = null;

  @Get("/")
  async getPositions() {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) {
      return { ok: true, data: this.cache.data };
    }
    const provider = getProvider();
    if (!provider.getPortfolio) {
      throw new ClientError(`provider ${provider.name} does not support portfolio`, undefined, 501);
    }
    const data = summarizePortfolio(await provider.getPortfolio());
    this.cache = { at: Date.now(), data };
    return { ok: true, data };
  }
}
