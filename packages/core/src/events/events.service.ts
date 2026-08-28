import type { MarketEvent } from '@kansoku/shared/types';
import type {
  EventCanvasJobStatus,
  EventListInput,
  EventSourceStatus,
  EventsApi,
} from '../contract/events.js';
import { ClientError } from '../platform/errors.js';
import { generateEventCanvas } from './eventCanvas.js';
import { normalizeEventListInput } from './eventListInput.js';
import { getEvent, listEvents, listSourceStates } from './store.js';

function toJobStatus(job: {
  eventId: string;
  clusterId: string;
  slug: string;
  symbols: string[];
  phase: EventCanvasJobStatus['phase'];
  error: string | null;
}): EventCanvasJobStatus {
  return {
    eventId: job.eventId,
    clusterId: job.clusterId,
    slug: job.slug,
    symbols: job.symbols,
    phase: job.phase,
    error: job.error,
  };
}

export const eventsService: EventsApi = {
  list(input: EventListInput): Promise<MarketEvent[]> {
    // Validation lives here rather than in the controller so the HTTP route and the
    // desktop IPC service cannot drift apart on what they accept.
    return listEvents(normalizeEventListInput(input));
  },

  async get({ id }: { id: string }): Promise<MarketEvent> {
    const event = await getEvent(id);
    if (!event) throw new ClientError(`event not found: ${id}`, undefined, 404);
    return event;
  },

  sourceHealth(): Promise<EventSourceStatus[]> {
    return listSourceStates();
  },

  async generateCanvas({ id }: { id: string }): Promise<EventCanvasJobStatus> {
    return toJobStatus(await generateEventCanvas({ id }));
  },
};
