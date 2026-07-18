import { defineRoutes } from "./defineRoutes.js";
import type { ChatDisplayMessage } from "@kansoku/pro-api";

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
  revision: string;
}

export type ResearchEditOperation =
  | { type: "replace"; oldText: string; newText: string }
  | { type: "insert_after"; anchor: string; content: string }
  | { type: "append"; content: string };

export type ResearchEditStatus = "pending" | "applied" | "rejected" | "undone" | "stale";

export interface ResearchEditProposal {
  id: string;
  sessionId: string;
  path: string;
  kind: ResearchKind;
  status: ResearchEditStatus;
  summary: string;
  operations: ResearchEditOperation[];
  appliedOperationIndexes: number[] | null;
  beforeMarkdown: string;
  afterMarkdown: string;
  baseRevision: string;
  afterRevision: string;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ResearchChatSession {
  id: string;
  path: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchChatState {
  session: ResearchChatSession | null;
  messages: ChatDisplayMessage[];
  busy: boolean;
  partial: string | null;
}

export type ResearchEvidenceKind = "document" | "market" | "news";

export interface ResearchEvidenceItem {
  id: string;
  kind: ResearchEvidenceKind;
  title: string;
  locator: string;
  asOf: string;
  summary: string;
}

export type ResearchFindingConfidence = "high" | "medium" | "low";

export interface ResearchFinding {
  title: string;
  assessment: string;
  confidence: ResearchFindingConfidence;
  evidenceIds: string[];
}

export interface ResearchRefreshReport {
  summary: string;
  evidence: ResearchEvidenceItem[];
  findings: ResearchFinding[];
  risks: ResearchFinding[];
  openQuestions: string[];
  proposalId: string | null;
  generatedAt: string;
}

export type ResearchRefreshStatus = "running" | "completed" | "failed" | "aborted";
export type ResearchRefreshPhase = "preparing" | "documents" | "market" | "synthesis" | "proposal" | "completed";

export interface ResearchRefreshTask {
  id: string;
  path: string;
  objective: string;
  status: ResearchRefreshStatus;
  phase: ResearchRefreshPhase;
  activity: string;
  baseRevision: string;
  report: ResearchRefreshReport | null;
  error: string | null;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export type ResearchPostMessageResult =
  | { status: 202; body: { accepted: true } }
  | { status: 409; body: { error: string } }
  | { status: 503; body: { error: string } };

export type ResearchAbortResult =
  | { status: 202; body: { aborted: true } }
  | { status: 409; body: { error: string } };

export interface ResearchApi {
  list(input: { kind?: ResearchKind; query?: string }): Promise<ResearchDocumentMeta[]>;
  get(input: { path: string }): Promise<ResearchDocument>;
  getChat(input: { path: string }): Promise<ResearchChatState>;
  postMessage(input: { path: string; text: string }): Promise<ResearchPostMessageResult>;
  abortChat(input: { path: string }): Promise<ResearchAbortResult>;
  suggestions(input: { path: string }): Promise<{ suggestions: string[] }>;
  getRefresh(input: { path: string }): Promise<ResearchRefreshTask | null>;
  startRefresh(input: { path: string; objective?: string }): Promise<ResearchRefreshTask>;
  abortRefresh(input: { path: string }): Promise<ResearchRefreshTask>;
  listEdits(input: { path: string }): Promise<ResearchEditProposal[]>;
  applyEdit(input: { id: string; path: string; operationIndexes?: number[] }): Promise<{
    proposal: ResearchEditProposal;
    document: ResearchDocument;
  }>;
  rejectEdit(input: { id: string; path: string }): Promise<ResearchEditProposal>;
  undoEdit(input: { id: string; path: string }): Promise<{
    proposal: ResearchEditProposal;
    document: ResearchDocument;
  }>;
}

export const researchRoutes = defineRoutes<ResearchApi>("research", {
  list: { method: "GET", path: "/" },
  get: { method: "GET", path: "/document" },
  getChat: { method: "GET", path: "/chat", raw: "body" },
  postMessage: { method: "POST", path: "/chat/messages", raw: "statusBody" },
  abortChat: { method: "POST", path: "/chat/abort", raw: "statusBody" },
  suggestions: { method: "GET", path: "/chat/suggestions", raw: "body" },
  getRefresh: { method: "GET", path: "/refresh" },
  startRefresh: { method: "POST", path: "/refresh" },
  abortRefresh: { method: "POST", path: "/refresh/abort" },
  listEdits: { method: "GET", path: "/edits" },
  applyEdit: { method: "POST", path: "/edits/:id/apply" },
  rejectEdit: { method: "POST", path: "/edits/:id/reject" },
  undoEdit: { method: "POST", path: "/edits/:id/undo" },
});
