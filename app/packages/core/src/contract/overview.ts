import type { AiUsageSummary, OverviewBoard, OverviewRecap, PredictionStats } from "../../../../shared/types.js";
import { defineRoutes } from "./defineRoutes.js";

export interface OverviewApi {
  board(): Promise<OverviewBoard>;
  recap(input: { date?: string }): Promise<OverviewRecap>;
  stats(): Promise<PredictionStats>;
  usage(input: { date?: string }): Promise<AiUsageSummary>;
  recapDates(): Promise<string[]>;
}

export const overviewRoutes = defineRoutes<OverviewApi>("overview", {
  board: { method: "GET", path: "/" },
  recap: { method: "GET", path: "/recap" },
  stats: { method: "GET", path: "/stats" },
  usage: { method: "GET", path: "/usage" },
  recapDates: { method: "GET", path: "/recap-dates" },
});
