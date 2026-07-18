import type { PortfolioSummary } from "@kansoku/shared/types";
import type { RawPortfolio } from "../../services/marketdata/types.js";

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
