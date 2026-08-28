import type {
  MarketEventClass,
  MarketEventPayload,
  MarketEventSeverity,
  MarketEventTrust,
} from '@kansoku/shared/types';
import type { EventSourceStatus } from '../contract/events.js';

// What an adapter hands over. Identity (id / dedupeKey / clusterId) is deliberately
// absent: only the domain knows the other sources, so only the domain can decide
// whether this draft is a duplicate or part of an existing cluster.
export interface MarketEventDraft {
  source: string;
  class: MarketEventClass;
  kind: string;
  symbols: string[];
  occurredAt: string;
  observedAt?: string;
  trust: MarketEventTrust;
  severity: MarketEventSeverity;
  payload: MarketEventPayload;
  dedupeKey?: string;
}

export interface ClusterCandidate {
  id: string;
  clusterId: string;
  source: string;
  class: MarketEventClass;
  symbols: string[];
  occurredAt: string;
}

// The collector's own view of a source and the one the UI reads are the same shape:
// a second definition here would drift from the contract on the first new field.
export type EventSourceState = EventSourceStatus;
