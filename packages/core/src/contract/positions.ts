import type { PortfolioSummary } from "@kansoku/shared/types";
import { defineRoutes } from "./defineRoutes.js";

export interface PositionsApi {
  list(): Promise<PortfolioSummary>;
}

export const positionsRoutes = defineRoutes<PositionsApi>("positions", {
  list: { method: "GET", path: "/" },
});
