import type { EventSourceHealth, MarketEvent, MarketEventClass } from '@kansoku/shared/types';
import { defineRoutes } from './defineRoutes.js';

export type EventCanvasPhase = 'queued' | 'running' | 'done' | 'failed';

export interface EventSourceStatus {
  source: string;
  health: EventSourceHealth;
  cursor: string | null;
  failureStreak: number;
  lastPolledAt: string | null;
  // A quiet source is not the same as a healthy one, so the last event time is
  // reported next to the last poll time instead of being inferred from it.
  lastEventAt: string | null;
  lastError: string | null;
  // Why the source is off, kept apart from lastError: "switched off" and "the last
  // poll blew up" read the same in the UI if they share a column.
  disabledReason: string | null;
  nextAttemptAt: string | null;
  updatedAt: string;
}

export interface EventListInput {
  symbol?: string;
  source?: string;
  class?: MarketEventClass;
  since?: string;
  // Keyset cursor for the next page: pass the last row's occurredAt and id, since
  // several events can share one timestamp.
  before?: string;
  beforeId?: string;
  // Values arrive as strings over HTTP; core normalizes and validates both forms.
  limit?: number | string;
}

export interface EventCanvasJobStatus {
  eventId: string;
  clusterId: string;
  slug: string;
  symbols: string[];
  phase: EventCanvasPhase;
  error: string | null;
}

export interface EventsApi {
  list(input: EventListInput): Promise<MarketEvent[]>;
  get(input: { id: string }): Promise<MarketEvent>;
  sourceHealth(): Promise<EventSourceStatus[]>;
  generateCanvas(input: { id: string }): Promise<EventCanvasJobStatus>;
}

export const eventsRoutes = defineRoutes<EventsApi>('events', {
  list: { method: 'GET', path: '/' },
  get: { method: 'GET', path: '/:id' },
  sourceHealth: { method: 'GET', path: '/sources/health' },
  generateCanvas: { method: 'POST', path: '/:id/canvas' },
});
