import { createHash } from 'node:crypto';
import type { ClusterCandidate, MarketEventDraft } from './types.js';

// Two sources reporting the same fact rarely agree on the minute, so the join is a
// window rather than an equality. 30 minutes is wide enough for a filing to reach a
// news wire and narrow enough that the next trading hour is a separate story.
export const CLUSTER_WINDOW_MS = 30 * 60 * 1000;

export function normalizeEventSymbols(symbols: string[]): string[] {
  const seen = new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean));
  return [...seen].sort();
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function buildDedupeKey(draft: MarketEventDraft): string {
  if (draft.dedupeKey) return draft.dedupeKey;
  const parts = [
    draft.class,
    draft.kind,
    draft.occurredAt,
    normalizeEventSymbols(draft.symbols).join(','),
    draft.payload.title,
  ];
  return sha256Hex(parts.join('\u0000')).slice(0, 32);
}

export function deriveEventId(source: string, dedupeKey: string): string {
  return sha256Hex(`${source}\u0000${dedupeKey}`).slice(0, 24);
}

export interface ClusterResolution {
  clusterId: string;
  // Clusters the new event bridges but that lost the tie-break: their rows have to
  // be rewritten to `clusterId`, or the same story stays split in two.
  mergeFrom: string[];
}

// The join is "another source, an overlapping subject, close in time". Class is
// deliberately not part of it: a filing and the news story about it are the same
// event seen twice, which is exactly what a cluster is for.
export function resolveCluster(
  draft: MarketEventDraft,
  candidates: ClusterCandidate[],
  windowMs: number = CLUSTER_WINDOW_MS,
): ClusterResolution {
  const ownId = deriveEventId(draft.source, buildDedupeKey(draft));
  const alone: ClusterResolution = { clusterId: ownId, mergeFrom: [] };
  const symbols = new Set(normalizeEventSymbols(draft.symbols));
  if (symbols.size === 0) return alone;
  const occurredAt = Date.parse(draft.occurredAt);
  if (!Number.isFinite(occurredAt)) return alone;

  // Earliest event in each matched cluster, so the winner does not depend on which
  // member of the cluster the query happened to return first.
  const earliest = new Map<string, number>();
  for (const candidate of candidates) {
    if (candidate.source === draft.source) continue;
    const at = Date.parse(candidate.occurredAt);
    if (!Number.isFinite(at) || Math.abs(at - occurredAt) > windowMs) continue;
    if (!normalizeEventSymbols(candidate.symbols).some((symbol) => symbols.has(symbol))) continue;
    const seen = earliest.get(candidate.clusterId);
    if (seen === undefined || at < seen) earliest.set(candidate.clusterId, at);
  }
  if (earliest.size === 0) return alone;

  const ranked = [...earliest.entries()].sort(
    ([aId, aAt], [bId, bAt]) => aAt - bAt || aId.localeCompare(bId),
  );
  const [clusterId] = ranked[0];
  return { clusterId, mergeFrom: ranked.slice(1).map(([id]) => id) };
}

export function pickClusterId(
  draft: MarketEventDraft,
  candidates: ClusterCandidate[],
  windowMs: number = CLUSTER_WINDOW_MS,
): string {
  return resolveCluster(draft, candidates, windowMs).clusterId;
}
