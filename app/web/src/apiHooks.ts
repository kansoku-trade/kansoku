import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, errorMessage } from "./api";

export interface QueryFailure {
  message: string;
  status?: number;
}

export interface QueryState<T> {
  data: T | null;
  error: string | null;
  failure: QueryFailure | null;
  loading: boolean;
  reload: () => void;
}

interface QueryInternalState<T> extends Omit<QueryState<T>, "reload"> {
  key: string | null;
}

const failureFrom = (error: unknown): QueryFailure => ({
  message: errorMessage(error),
  status: error instanceof ApiError ? error.status : undefined,
});

const queryCache = new Map<string, unknown>();

const initialState = <T>(key: string | null): QueryInternalState<T> => {
  const cached = key !== null && queryCache.has(key);
  return {
    key,
    data: cached ? (queryCache.get(key!) as T) : null,
    error: null,
    failure: null,
    loading: Boolean(key) && !cached,
  };
};

export function useQuery<T>(key: string | null, fetch: () => Promise<T>): QueryState<T> {
  const [state, setState] = useState<QueryInternalState<T>>(() => initialState<T>(key));
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const fetchRef = useRef(fetch);
  fetchRef.current = fetch;

  useEffect(() => {
    let active = true;

    setState(initialState<T>(key));
    if (!key) return;

    fetchRef
      .current()
      .then((data) => {
        queryCache.set(key, data);
        if (active) setState({ key, data, error: null, failure: null, loading: false });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const failure = failureFrom(error);
        setState({ key, data: null, error: failure.message, failure, loading: false });
      });

    return () => {
      active = false;
    };
  }, [key, version]);

  const visibleState = state.key === key ? state : initialState<T>(key);
  const { key: _key, ...queryState } = visibleState;
  return { ...queryState, reload };
}

export function usePollingQuery<T>(key: string | null, fetch: () => Promise<T>, ms: number): QueryState<T> {
  const [state, setState] = useState<QueryInternalState<T>>(() => initialState<T>(key));
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const fetchRef = useRef(fetch);
  fetchRef.current = fetch;

  useEffect(() => {
    let active = true;
    let inFlight = false;

    setState(initialState<T>(key));
    if (!key) return;

    const load = () => {
      if (inFlight) return;
      inFlight = true;
      setState((prev) => (prev.data === null ? { ...prev, loading: true } : prev));
      fetchRef
        .current()
        .then((data) => {
          queryCache.set(key, data);
          if (active) setState({ key, data, error: null, failure: null, loading: false });
        })
        .catch((error: unknown) => {
          if (!active) return;
          const failure = failureFrom(error);
          setState((prev) => ({ ...prev, error: failure.message, failure, loading: false }));
        })
        .finally(() => {
          inFlight = false;
        });
    };

    load();
    const timer = window.setInterval(load, ms);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [key, ms, version]);

  const visibleState = state.key === key ? state : initialState<T>(key);
  const { key: _key, ...queryState } = visibleState;
  return { ...queryState, reload };
}
