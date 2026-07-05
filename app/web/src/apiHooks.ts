import { useCallback, useEffect, useState } from "react";
import { ApiError, api, errorMessage, isAbortError } from "./api";

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
  url: string | null;
}

const failureFrom = (error: unknown): QueryFailure => ({
  message: errorMessage(error),
  status: error instanceof ApiError ? error.status : undefined,
});

const initialState = <T>(url: string | null): QueryInternalState<T> => ({
  url,
  data: null,
  error: null,
  failure: null,
  loading: Boolean(url),
});

export function useQuery<T>(url: string | null): QueryState<T> {
  const [state, setState] = useState<QueryInternalState<T>>(() => initialState<T>(url));
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setState(initialState<T>(url));
    if (!url) {
      return () => controller.abort();
    }

    api<T>(url, { signal: controller.signal })
      .then((data) => {
        if (active) setState({ url, data, error: null, failure: null, loading: false });
      })
      .catch((error: unknown) => {
        if (!active || isAbortError(error)) return;
        const failure = failureFrom(error);
        setState({ url, data: null, error: failure.message, failure, loading: false });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [url, version]);

  const visibleState = state.url === url ? state : initialState<T>(url);
  const { url: _url, ...queryState } = visibleState;
  return { ...queryState, reload };
}

export function usePollingQuery<T>(url: string | null, ms: number): QueryState<T> {
  const [state, setState] = useState<QueryInternalState<T>>(() => initialState<T>(url));
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let inFlight = false;

    setState(initialState<T>(url));
    if (!url) {
      return () => controller.abort();
    }

    const load = () => {
      if (inFlight || controller.signal.aborted) return;
      inFlight = true;
      setState((prev) => (prev.data === null ? { ...prev, loading: true } : prev));
      api<T>(url, { signal: controller.signal })
        .then((data) => {
          if (active) setState({ url, data, error: null, failure: null, loading: false });
        })
        .catch((error: unknown) => {
          if (!active || isAbortError(error)) return;
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
      controller.abort();
      window.clearInterval(timer);
    };
  }, [url, ms, version]);

  const visibleState = state.url === url ? state : initialState<T>(url);
  const { url: _url, ...queryState } = visibleState;
  return { ...queryState, reload };
}
