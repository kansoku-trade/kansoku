import { and, desc, eq } from "drizzle-orm";
import type {
  ResearchDocument,
  ResearchEditOperation,
  ResearchEditProposal,
  ResearchEditStatus,
  ResearchKind,
} from "../../contract/research.js";
import { getDb, type Db } from "../../db/index.js";
import { researchEditProposals } from "../../db/schema.js";
import { PROJECT_ROOT } from "../../env.js";
import { ClientError } from "../../errors.js";
import { nextSnowflake } from "../../db/snowflake.js";
import {
  createResearchService,
  researchDocumentRevision,
  writeResearchDocumentAtomic,
} from "./research.service.js";

const MAX_OPERATIONS = 12;
const MAX_OPERATION_TEXT = 100_000;
const MAX_DOCUMENT_TEXT = 500_000;
const MAX_SUMMARY = 240;

interface ResearchEditDeps {
  rootDir?: string;
  db?: Db;
  now?: () => Date;
}

function occurrenceCount(text: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let offset = 0;
  while (offset <= text.length - needle.length) {
    const index = text.indexOf(needle, offset);
    if (index === -1) break;
    count += 1;
    offset = index + needle.length;
  }
  return count;
}

function validateText(value: string, label: string, allowEmpty = false): string {
  if ((!allowEmpty && !value.trim()) || value.length > MAX_OPERATION_TEXT) {
    throw new ClientError(`${label} must be ${allowEmpty ? "at most" : "a non-empty string of at most"} ${MAX_OPERATION_TEXT} characters`);
  }
  return value;
}

function appendSection(markdown: string, content: string): string {
  const section = content.trim();
  const separator = markdown.endsWith("\n\n") ? "" : markdown.endsWith("\n") ? "\n" : "\n\n";
  return `${markdown}${separator}${section}\n`;
}

function applyOperation(markdown: string, operation: ResearchEditOperation): string {
  if (operation.type === "append") {
    return appendSection(markdown, validateText(operation.content, "append content"));
  }

  if (operation.type === "replace") {
    const oldText = validateText(operation.oldText, "replace oldText");
    const newText = validateText(operation.newText, "replace newText", true);
    if (occurrenceCount(markdown, oldText) !== 1) {
      throw new ClientError("replace oldText must match the current document exactly once");
    }
    return markdown.replace(oldText, newText);
  }

  const anchor = validateText(operation.anchor, "insert_after anchor");
  const content = validateText(operation.content, "insert_after content");
  if (occurrenceCount(markdown, anchor) !== 1) {
    throw new ClientError("insert_after anchor must match the current document exactly once");
  }
  const separator = anchor.endsWith("\n") ? "\n" : "\n\n";
  return markdown.replace(anchor, `${anchor}${separator}${content.trim()}`);
}

export function applyResearchEditOperations(
  markdown: string,
  kind: ResearchKind,
  operations: ResearchEditOperation[],
): string {
  if (operations.length === 0 || operations.length > MAX_OPERATIONS) {
    throw new ClientError(`an edit proposal must contain between 1 and ${MAX_OPERATIONS} operations`);
  }
  if (kind === "journal" && operations.some((operation) => operation.type !== "append")) {
    throw new ClientError("journal documents are append-only", "add a dated correction or follow-up section instead");
  }

  let next = markdown;
  for (const operation of operations) next = applyOperation(next, operation);
  if (next === markdown) throw new ClientError("edit proposal does not change the document");
  if (next.length > MAX_DOCUMENT_TEXT) throw new ClientError(`research documents cannot exceed ${MAX_DOCUMENT_TEXT} characters`);
  return next;
}

function toProposal(row: typeof researchEditProposals.$inferSelect): ResearchEditProposal {
  return {
    id: row.id,
    sessionId: row.sessionId,
    path: row.path,
    kind: row.kind,
    status: row.status,
    summary: row.summary,
    operations: row.operations,
    appliedOperationIndexes: row.appliedOperationIndexes ?? null,
    beforeMarkdown: row.beforeMarkdown,
    afterMarkdown: row.afterMarkdown,
    baseRevision: row.baseRevision,
    afterRevision: row.afterRevision,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt ?? null,
  };
}

async function loadProposal(id: string, path: string, db: Db): Promise<ResearchEditProposal> {
  const rows = await db
    .select()
    .from(researchEditProposals)
    .where(and(eq(researchEditProposals.id, id), eq(researchEditProposals.path, path)))
    .limit(1);
  if (!rows[0]) throw new ClientError("research edit proposal not found", undefined, 404);
  return toProposal(rows[0]);
}

function requireStatus(proposal: ResearchEditProposal, expected: ResearchEditStatus): void {
  if (proposal.status !== expected) {
    throw new ClientError(`research edit proposal is ${proposal.status}, expected ${expected}`, undefined, 409);
  }
}

function selectedIndexes(operationCount: number, requested?: number[]): number[] {
  const indexes = requested ?? Array.from({ length: operationCount }, (_, index) => index);
  const unique = [...new Set(indexes)].sort((a, b) => a - b);
  if (unique.length === 0 || unique.some((index) => !Number.isInteger(index) || index < 0 || index >= operationCount)) {
    throw new ClientError("operationIndexes must select at least one valid edit operation");
  }
  return unique;
}

export async function createResearchEditProposal(
  input: {
    sessionId: string;
    path: string;
    summary: string;
    operations: ResearchEditOperation[];
    expectedRevision?: string;
  },
  deps: ResearchEditDeps = {},
): Promise<ResearchEditProposal> {
  const rootDir = deps.rootDir ?? PROJECT_ROOT;
  const db = deps.db ?? getDb();
  const document = await createResearchService(rootDir).get({ path: input.path });
  if (input.expectedRevision && document.revision !== input.expectedRevision) {
    throw new ClientError(
      "research document changed while the research task was running",
      "refresh the document and start a new research task",
      409,
      "research_revision_conflict",
    );
  }
  const summary = input.summary.trim().slice(0, MAX_SUMMARY);
  if (!summary) throw new ClientError("edit proposal summary cannot be empty");
  const afterMarkdown = applyResearchEditOperations(document.markdown, document.kind, input.operations);
  const now = (deps.now ?? (() => new Date()))().toISOString();
  const proposal: ResearchEditProposal = {
    id: nextSnowflake(),
    sessionId: input.sessionId,
    path: document.path,
    kind: document.kind,
    status: "pending",
    summary,
    operations: input.operations,
    appliedOperationIndexes: null,
    beforeMarkdown: document.markdown,
    afterMarkdown,
    baseRevision: document.revision,
    afterRevision: researchDocumentRevision(afterMarkdown),
    createdAt: now,
    resolvedAt: null,
  };
  await db.insert(researchEditProposals).values(proposal);
  return proposal;
}

export async function listResearchEditProposals(
  path: string,
  deps: ResearchEditDeps = {},
): Promise<ResearchEditProposal[]> {
  const db = deps.db ?? getDb();
  const rows = await db
    .select()
    .from(researchEditProposals)
    .where(eq(researchEditProposals.path, path))
    .orderBy(desc(researchEditProposals.createdAt), desc(researchEditProposals.id))
    .limit(20);
  return rows.map(toProposal);
}

export async function applyResearchEditProposal(
  input: { id: string; path: string; operationIndexes?: number[] },
  deps: ResearchEditDeps = {},
): Promise<{ proposal: ResearchEditProposal; document: ResearchDocument }> {
  const rootDir = deps.rootDir ?? PROJECT_ROOT;
  const db = deps.db ?? getDb();
  const proposal = await loadProposal(input.id, input.path, db);
  requireStatus(proposal, "pending");
  const indexes = selectedIndexes(proposal.operations.length, input.operationIndexes);
  const current = await createResearchService(rootDir).get({ path: proposal.path });
  if (current.revision !== proposal.baseRevision) {
    const resolvedAt = (deps.now ?? (() => new Date()))().toISOString();
    await db
      .update(researchEditProposals)
      .set({ status: "stale", resolvedAt })
      .where(eq(researchEditProposals.id, proposal.id));
    throw new ClientError(
      "research document changed since the edit was proposed",
      "refresh the document and generate a new proposal",
      409,
      "research_revision_conflict",
    );
  }

  const operations = indexes.map((index) => proposal.operations[index]);
  const markdown = applyResearchEditOperations(current.markdown, current.kind, operations);
  const document = await writeResearchDocumentAtomic({
    rootDir,
    path: proposal.path,
    markdown,
    expectedRevision: proposal.baseRevision,
  });
  const resolvedAt = (deps.now ?? (() => new Date()))().toISOString();
  await db
    .update(researchEditProposals)
    .set({
      status: "applied",
      appliedOperationIndexes: indexes,
      afterMarkdown: document.markdown,
      afterRevision: document.revision,
      resolvedAt,
    })
    .where(eq(researchEditProposals.id, proposal.id));
  return { proposal: await loadProposal(proposal.id, proposal.path, db), document };
}

export async function rejectResearchEditProposal(
  input: { id: string; path: string },
  deps: ResearchEditDeps = {},
): Promise<ResearchEditProposal> {
  const db = deps.db ?? getDb();
  const proposal = await loadProposal(input.id, input.path, db);
  requireStatus(proposal, "pending");
  const resolvedAt = (deps.now ?? (() => new Date()))().toISOString();
  await db
    .update(researchEditProposals)
    .set({ status: "rejected", resolvedAt })
    .where(eq(researchEditProposals.id, proposal.id));
  return loadProposal(proposal.id, proposal.path, db);
}

export async function undoResearchEditProposal(
  input: { id: string; path: string },
  deps: ResearchEditDeps = {},
): Promise<{ proposal: ResearchEditProposal; document: ResearchDocument }> {
  const rootDir = deps.rootDir ?? PROJECT_ROOT;
  const db = deps.db ?? getDb();
  const proposal = await loadProposal(input.id, input.path, db);
  requireStatus(proposal, "applied");
  const document = await writeResearchDocumentAtomic({
    rootDir,
    path: proposal.path,
    markdown: proposal.beforeMarkdown,
    expectedRevision: proposal.afterRevision,
  });
  const resolvedAt = (deps.now ?? (() => new Date()))().toISOString();
  await db
    .update(researchEditProposals)
    .set({ status: "undone", resolvedAt })
    .where(eq(researchEditProposals.id, proposal.id));
  return { proposal: await loadProposal(proposal.id, proposal.path, db), document };
}
