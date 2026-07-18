import { useQuery, usePollingQuery } from "@web/apiHooks";

interface IntervalFetchState<T> {
  data: T | null;
  error: string | null;
  dataUpdatedAt: number | null;
  refreshed: boolean;
}

export function useIntervalFetch<T>(key: string | null, fetch: () => Promise<T>, ms: number | null): IntervalFetchState<T> {
  const oneShot = useQuery<T>(ms === null ? key : null, fetch);
  const polling = usePollingQuery<T>(ms === null ? null : key, fetch, ms ?? 0);
  const active = ms === null ? oneShot : polling;
  return { data: active.data, error: active.error, dataUpdatedAt: active.dataUpdatedAt, refreshed: active.refreshed };
}
