import type { EventSourceStatus } from '@kansoku/core/contract/events';
import { usePollingQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';

// Source health changes on the collector's own polling cadence, not on the tape's,
// so refreshing it any faster only adds requests.
export const EVENT_SOURCE_HEALTH_POLL_MS = 60_000;

export interface EventSourceHealthState {
  sources: EventSourceStatus[] | null;
  error: string | null;
  loading: boolean;
}

export function useEventSourceHealth(enabled: boolean): EventSourceHealthState {
  const { data, error, loading } = usePollingQuery<EventSourceStatus[]>(
    enabled ? 'events.sourceHealth' : null,
    () => client.events.sourceHealth(),
    EVENT_SOURCE_HEALTH_POLL_MS,
  );
  return { sources: data, error, loading };
}
