import { useQuery as useReactQuery } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { ApiError, errorMessage } from './api';

interface QueryFailure {
  message: string;
  status?: number;
}

export interface QueryState<T> {
  data: T | null;
  error: string | null;
  failure: QueryFailure | null;
  loading: boolean;
  reload: () => void;
  dataUpdatedAt: number | null;
  refreshed: boolean;
}

export interface QueryOptions {
  cache?: boolean;
  persist?: boolean;
}

const failureFrom = (error: unknown): QueryFailure => ({
  message: errorMessage(error),
  status: error instanceof ApiError ? error.status : undefined,
});

function useQueryState<T>(
  key: string | null,
  fetch: () => Promise<T>,
  options: QueryOptions,
  refetchInterval?: number,
): QueryState<T> {
  const useCache = options.cache !== false;
  const shouldPersist = useCache && options.persist !== false;
  const fetchRef = useRef(fetch);
  fetchRef.current = fetch;

  const query = useReactQuery<T>({
    queryKey: [key],
    queryFn: () => fetchRef.current(),
    enabled: key !== null,
    staleTime: useCache ? 30_000 : 0,
    gcTime: useCache ? undefined : 0,
    meta: shouldPersist ? undefined : { persist: false },
    refetchInterval,
  });

  const data = query.data ?? null;
  const failure = query.error ? failureFrom(query.error) : null;
  const { refetch } = query;
  // Callers put reload in effect deps; a fresh closure per render would refetch forever.
  const reload = useCallback(() => {
    if (key === null) return;
    void refetch();
  }, [key, refetch]);

  return {
    data,
    error: failure?.message ?? null,
    failure,
    loading: query.isLoading,
    dataUpdatedAt: data === null ? null : query.dataUpdatedAt,
    refreshed: query.isFetchedAfterMount && query.isSuccess,
    reload,
  };
}

export function useQuery<T>(
  key: string | null,
  fetch: () => Promise<T>,
  options: QueryOptions = {},
): QueryState<T> {
  return useQueryState(key, fetch, options);
}

export function usePollingQuery<T>(
  key: string | null,
  fetch: () => Promise<T>,
  ms: number,
  options: QueryOptions = {},
): QueryState<T> {
  return useQueryState(key, fetch, options, ms);
}
