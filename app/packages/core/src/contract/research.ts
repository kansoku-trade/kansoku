import { defineRoutes } from "./defineRoutes.js";

export type ResearchKind = "stock" | "journal";

export type ResearchDocumentType =
  | "stock"
  | "intraday"
  | "recap"
  | "flow"
  | "lessons"
  | "decision"
  | "archive"
  | "journal";

export interface ResearchDocumentMeta {
  path: string;
  kind: ResearchKind;
  type: ResearchDocumentType;
  title: string;
  date: string | null;
  symbols: string[];
  mtime: string;
  excerpt: string;
}

export interface ResearchDocument extends ResearchDocumentMeta {
  markdown: string;
}

export interface ResearchApi {
  list(input: { kind?: ResearchKind; query?: string }): Promise<ResearchDocumentMeta[]>;
  get(input: { path: string }): Promise<ResearchDocument>;
}

export const researchRoutes = defineRoutes<ResearchApi>("research", {
  list: { method: "GET", path: "/" },
  get: { method: "GET", path: "/document" },
});
