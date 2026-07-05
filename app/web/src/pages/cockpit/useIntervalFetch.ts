import { usePollingQuery } from "../../apiHooks";

interface IntervalFetchState<T> {
  data: T | null;
  error: string | null;
}

export function useIntervalFetch<T>(url: string | null, ms: number): IntervalFetchState<T> {
  const { data, error } = usePollingQuery<T>(url, ms);
  return { data, error };
}
