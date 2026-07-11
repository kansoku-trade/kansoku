import type {
  BenchmarkSeries,
  ChartDoc,
  CockpitComment,
  CockpitFlow,
  CockpitPosition,
  RelativeVolume,
  SymbolAnalysisRow,
} from "../../../../shared/types.js";
import type { DeepDiveState } from "../ai/deepDive.js";
import { defineRoutes } from "./defineRoutes.js";

export interface JournalListRow {
  name: string;
  date: string;
}

export interface JournalEntry {
  name: string;
  markdown: string;
  mtime: string;
}

export interface NoteResult {
  markdown: string | null;
  mtime?: string;
}

export type ReassessResult = { started: boolean; reason?: string };

export type DeepDiveStartResult = { started: true } | { started: false; reason: "busy" | "disabled" };

export interface LatestChart extends ChartDoc {
  url: string;
  prediction_stale: boolean;
}

export interface SymbolsApi {
  flow(input: { sym: string }): Promise<CockpitFlow | null>;
  benchmark(input: { sym: string }): Promise<BenchmarkSeries[]>;
  position(input: { sym: string }): Promise<CockpitPosition | null>;
  analyses(input: { sym: string }): Promise<SymbolAnalysisRow[]>;
  relvol(input: { sym: string }): Promise<RelativeVolume | null>;
  comments(input: { sym: string; date?: string }): Promise<CockpitComment[]>;
  commentDates(input: { sym: string }): Promise<string[]>;
  journal(input: { sym: string }): Promise<JournalListRow[]>;
  journalEntry(input: { sym: string; name: string }): Promise<JournalEntry>;
  reassess(input: { sym: string }): Promise<ReassessResult>;
  note(input: { sym: string }): Promise<NoteResult>;
  deepDive(input: { sym: string }): Promise<DeepDiveStartResult>;
  deepDiveStatus(): Promise<DeepDiveState>;
  latest(input: { sym: string }): Promise<LatestChart>;
}

export const symbolsRoutes = defineRoutes<SymbolsApi>("symbols", {
  flow: { method: "GET", path: "/:sym/flow" },
  benchmark: { method: "GET", path: "/:sym/benchmark" },
  position: { method: "GET", path: "/:sym/position" },
  analyses: { method: "GET", path: "/:sym/analyses" },
  relvol: { method: "GET", path: "/:sym/relvol" },
  comments: { method: "GET", path: "/:sym/comments" },
  commentDates: { method: "GET", path: "/:sym/comment-dates" },
  journal: { method: "GET", path: "/:sym/journal" },
  journalEntry: { method: "GET", path: "/:sym/journal/:name" },
  reassess: { method: "POST", path: "/:sym/reassess" },
  note: { method: "GET", path: "/:sym/note" },
  deepDive: { method: "POST", path: "/:sym/deep-dive" },
  deepDiveStatus: { method: "GET", path: "/:sym/deep-dive/status" },
  latest: { method: "GET", path: "/:sym/latest" },
});
