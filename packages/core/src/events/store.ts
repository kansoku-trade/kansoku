import { and, asc, desc, eq, gte, inArray, lt, or, sql } from 'drizzle-orm';
import type { EventSourceHealth, MarketEvent, MarketEventClass } from '@kansoku/shared/types';
import { getDb, type Db } from '../db/index.js';
import { eventSourceCursors, marketEvents } from '../db/schema.js';
import { publishMarketEvent } from './bus.js';
import { DEFAULT_EVENT_LIST_LIMIT } from './eventListInput.js';
import {
  buildDedupeKey,
  CLUSTER_WINDOW_MS,
  deriveEventId,
  normalizeEventSymbols,
  resolveCluster,
} from './identity.js';
import type { ClusterCandidate, EventSourceState, MarketEventDraft } from './types.js';

export interface ListEventsOptions {
  symbol?: string;
  source?: string;
  class?: MarketEventClass;
  since?: string;
  // Keyset cursor: rows strictly older than `before`, with `beforeId` breaking the
  // tie when several events share one occurredAt.
  before?: string;
  beforeId?: string;
  limit?: number;
}

// better-sqlite3 runs statements synchronously, so a transaction callback is the
// only place where "look, then insert" cannot be interleaved by another ingest.
type EventTx = Parameters<Parameters<Db['transaction']>[0]>[0];

function toEvent(row: typeof marketEvents.$inferSelect): MarketEvent {
  return {
    id: row.id,
    dedupeKey: row.dedupeKey,
    clusterId: row.clusterId,
    source: row.source,
    class: row.class,
    kind: row.kind,
    symbols: row.symbols,
    occurredAt: row.occurredAt,
    observedAt: row.observedAt,
    trust: row.trust,
    severity: row.severity,
    payload: row.payload,
    canvasSlug: row.canvasSlug ?? null,
  };
}

function escapeLike(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

function findByDedupeKey(source: string, dedupeKey: string, tx: EventTx): MarketEvent | null {
  const [row] = tx
    .select()
    .from(marketEvents)
    .where(and(eq(marketEvents.source, source), eq(marketEvents.dedupeKey, dedupeKey)))
    .limit(1)
    .all();
  return row ? toEvent(row) : null;
}

function clusterCandidates(draft: MarketEventDraft, tx: EventTx): ClusterCandidate[] {
  const occurredAt = Date.parse(draft.occurredAt);
  if (!Number.isFinite(occurredAt)) return [];
  const from = new Date(occurredAt - CLUSTER_WINDOW_MS).toISOString();
  const to = new Date(occurredAt + CLUSTER_WINDOW_MS).toISOString();
  return tx
    .select({
      id: marketEvents.id,
      clusterId: marketEvents.clusterId,
      source: marketEvents.source,
      class: marketEvents.class,
      symbols: marketEvents.symbols,
      occurredAt: marketEvents.occurredAt,
    })
    .from(marketEvents)
    .where(and(gte(marketEvents.occurredAt, from), sql`${marketEvents.occurredAt} <= ${to}`))
    .orderBy(asc(marketEvents.occurredAt), asc(marketEvents.id))
    .all();
}

export interface IngestResult {
  event: MarketEvent;
  created: boolean;
  // Rows whose clusterId this ingest rewrote, in their post-merge state. They are
  // republished so a live client can update them by id instead of resyncing.
  reclustered: MarketEvent[];
}

export async function ingestEvent(
  draft: MarketEventDraft,
  db: Db = getDb(),
): Promise<IngestResult> {
  const dedupeKey = buildDedupeKey(draft);
  // The dedupe read, the cluster decision, the insert and the merge are one
  // synchronous unit: two sources ingesting the same story at the same moment
  // would otherwise both see an empty window and each start a cluster.
  const result = db.transaction((tx): IngestResult => {
    const existing = findByDedupeKey(draft.source, dedupeKey, tx);
    if (existing) return { event: existing, created: false, reclustered: [] };

    const { clusterId, mergeFrom } = resolveCluster(draft, clusterCandidates(draft, tx));
    const event: MarketEvent = {
      id: deriveEventId(draft.source, dedupeKey),
      dedupeKey,
      clusterId,
      source: draft.source,
      class: draft.class,
      kind: draft.kind,
      symbols: normalizeEventSymbols(draft.symbols),
      occurredAt: draft.occurredAt,
      observedAt: draft.observedAt ?? new Date().toISOString(),
      trust: draft.trust,
      severity: draft.severity,
      payload: draft.payload,
      canvasSlug: null,
    };

    const inserted = tx.insert(marketEvents).values(event).onConflictDoNothing().returning().all();
    if (inserted.length === 0) {
      // Lost a race on the same key: the winner's row is the truth, and this draft
      // is a duplicate like any other re-poll.
      const winner = findByDedupeKey(draft.source, dedupeKey, tx);
      if (winner) return { event: winner, created: false, reclustered: [] };
    }
    const reclustered =
      mergeFrom.length > 0
        ? tx
            .update(marketEvents)
            .set({ clusterId })
            .where(inArray(marketEvents.clusterId, mergeFrom))
            .returning()
            .all()
        : [];
    return { event, created: true, reclustered: reclustered.map(toEvent) };
  });

  // Announced only after the transaction committed, so no subscriber can read a
  // cluster id that was rolled back.
  if (result.created) {
    publishMarketEvent(result.event);
    for (const moved of result.reclustered) publishMarketEvent(moved);
  }
  return result;
}

export async function ingestEvents(
  drafts: MarketEventDraft[],
  db: Db = getDb(),
): Promise<IngestResult[]> {
  const results: IngestResult[] = [];
  for (const draft of drafts) results.push(await ingestEvent(draft, db));
  return results;
}

export async function listEvents(
  options: ListEventsOptions = {},
  db: Db = getDb(),
): Promise<MarketEvent[]> {
  const filters = [];
  if (options.source) filters.push(eq(marketEvents.source, options.source));
  if (options.class) filters.push(eq(marketEvents.class, options.class));
  if (options.since) filters.push(gte(marketEvents.occurredAt, options.since));
  if (options.before) {
    filters.push(
      options.beforeId
        ? or(
            lt(marketEvents.occurredAt, options.before),
            and(eq(marketEvents.occurredAt, options.before), lt(marketEvents.id, options.beforeId)),
          )
        : lt(marketEvents.occurredAt, options.before),
    );
  }
  if (options.symbol) {
    // symbols is a JSON array in a text column; the quoted form makes the match
    // exact rather than a prefix hit ("MU.US" must not match "AMU.US"), and the
    // escape keeps a `%` or `_` in the input from turning into a wildcard.
    const needle = `%"${escapeLike(options.symbol.trim().toUpperCase())}"%`;
    filters.push(sql`${marketEvents.symbols} like ${needle} escape '\\'`);
  }
  const rows = await db
    .select()
    .from(marketEvents)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(marketEvents.occurredAt), desc(marketEvents.id))
    .limit(options.limit ?? DEFAULT_EVENT_LIST_LIMIT);
  return rows.map(toEvent);
}

export async function getEvent(id: string, db: Db = getDb()): Promise<MarketEvent | null> {
  const [row] = await db.select().from(marketEvents).where(eq(marketEvents.id, id)).limit(1);
  return row ? toEvent(row) : null;
}

export async function listEventsByCluster(
  clusterId: string,
  db: Db = getDb(),
): Promise<MarketEvent[]> {
  const rows = await db
    .select()
    .from(marketEvents)
    .where(eq(marketEvents.clusterId, clusterId))
    .orderBy(asc(marketEvents.occurredAt), asc(marketEvents.id));
  return rows.map(toEvent);
}

export async function setEventCanvasSlug(
  id: string,
  canvasSlug: string,
  db: Db = getDb(),
): Promise<MarketEvent | null> {
  const [row] = await db
    .update(marketEvents)
    .set({ canvasSlug })
    .where(eq(marketEvents.id, id))
    .returning();
  if (!row) return null;
  const event = toEvent(row);
  publishMarketEvent(event);
  return event;
}

export interface SourceStatePatch {
  source: string;
  cursor?: string | null;
  health?: EventSourceHealth;
  failureStreak?: number;
  lastPolledAt?: string | null;
  lastEventAt?: string | null;
  lastError?: string | null;
  disabledReason?: string | null;
  nextAttemptAt?: string | null;
}

function toState(row: typeof eventSourceCursors.$inferSelect): EventSourceState {
  return {
    source: row.source,
    cursor: row.cursor ?? null,
    health: row.health,
    failureStreak: row.failureStreak,
    lastPolledAt: row.lastPolledAt ?? null,
    lastEventAt: row.lastEventAt ?? null,
    lastError: row.lastError ?? null,
    disabledReason: row.disabledReason ?? null,
    nextAttemptAt: row.nextAttemptAt ?? null,
    updatedAt: row.updatedAt,
  };
}

export async function readSourceState(
  source: string,
  db: Db = getDb(),
): Promise<EventSourceState | null> {
  const [row] = await db
    .select()
    .from(eventSourceCursors)
    .where(eq(eventSourceCursors.source, source))
    .limit(1);
  return row ? toState(row) : null;
}

export async function listSourceStates(db: Db = getDb()): Promise<EventSourceState[]> {
  const rows = await db.select().from(eventSourceCursors).orderBy(asc(eventSourceCursors.source));
  return rows.map(toState);
}

// Monotonic unless reset on purpose: a write that finished late must not make the
// source look like it went quiet hours ago.
function pickLater(patched: string | null | undefined, current: string | null): string | null {
  if (patched === undefined) return current;
  if (patched === null || current === null) return patched;
  return patched > current ? patched : current;
}

function pickFailureStreak(patched: number | undefined, current: number): number {
  if (patched === undefined) return current;
  // Zero is the one explicit "this source just worked" signal, so it always lands.
  // Anything else may only escalate, which keeps an out-of-order failure write from
  // looking like progress.
  return patched === 0 ? 0 : Math.max(patched, current);
}

export async function saveSourceState(
  patch: SourceStatePatch,
  db: Db = getDb(),
): Promise<EventSourceState> {
  // Read and write in one synchronous transaction: two collectors patching
  // different fields of the same source would otherwise each write a row built from
  // a pre-merge read, and the later one would erase the other's field.
  return db.transaction((tx): EventSourceState => {
    const [row] = tx
      .select()
      .from(eventSourceCursors)
      .where(eq(eventSourceCursors.source, patch.source))
      .limit(1)
      .all();
    const current = row ? toState(row) : null;
    const next: EventSourceState = {
      source: patch.source,
      cursor: patch.cursor !== undefined ? patch.cursor : (current?.cursor ?? null),
      health: patch.health ?? current?.health ?? 'active',
      failureStreak: pickFailureStreak(patch.failureStreak, current?.failureStreak ?? 0),
      lastPolledAt: pickLater(patch.lastPolledAt, current?.lastPolledAt ?? null),
      lastEventAt: pickLater(patch.lastEventAt, current?.lastEventAt ?? null),
      lastError: patch.lastError !== undefined ? patch.lastError : (current?.lastError ?? null),
      disabledReason:
        patch.disabledReason !== undefined
          ? patch.disabledReason
          : (current?.disabledReason ?? null),
      nextAttemptAt:
        patch.nextAttemptAt !== undefined ? patch.nextAttemptAt : (current?.nextAttemptAt ?? null),
      updatedAt: new Date().toISOString(),
    };
    tx.insert(eventSourceCursors)
      .values(next)
      .onConflictDoUpdate({ target: eventSourceCursors.source, set: next })
      .run();
    return next;
  });
}
