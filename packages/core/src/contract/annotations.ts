import type { Annotation } from "@kansoku/shared/types";
import { defineRoutes } from "./defineRoutes.js";

export interface AnnotationsApi {
  list(input: { symbol: string }): Promise<Annotation[]>;
  replace(input: { symbol: string; annotations: unknown; clientId?: string }): Promise<{ count: number }>;
}

export const annotationsRoutes = defineRoutes<AnnotationsApi>("annotations", {
  list: { method: "GET", path: "/:symbol" },
  replace: { method: "PUT", path: "/:symbol" },
});
