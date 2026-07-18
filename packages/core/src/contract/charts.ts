import type { ChartDoc, ChartMeta } from "@kansoku/shared/types";
import { defineRoutes, type WithMeta } from "./defineRoutes.js";

export interface ChartListItem extends ChartMeta {
  url: string;
  prediction_stale: boolean;
}

export interface ChartWithStale extends ChartDoc {
  prediction_stale: boolean;
}

export interface ChartBuiltResult {
  built: unknown;
  count: number;
}

export interface ChartsApi {
  list(input?: { type?: string; symbol?: string; limit?: number; stale?: boolean }): Promise<ChartListItem[]>;
  get(input: { id: string }): Promise<ChartWithStale>;
  create(input: Record<string, unknown>): Promise<WithMeta<Record<string, unknown>>>;
  update(input: { id: string } & Record<string, unknown>): Promise<WithMeta<Record<string, unknown>>>;
  remove(input: { id: string }): Promise<{ id: string; deleted: true }>;
  built(input: { id: string; count?: number | string; mode?: "forward" }): Promise<ChartBuiltResult>;
}

export const chartsRoutes = defineRoutes<ChartsApi>("charts", {
  list: { method: "GET", path: "/" },
  get: { method: "GET", path: "/:id" },
  create: { method: "POST", path: "/", withMeta: true },
  update: { method: "PATCH", path: "/:id", withMeta: true },
  remove: { method: "DELETE", path: "/:id" },
  built: { method: "GET", path: "/:id/built" },
});
