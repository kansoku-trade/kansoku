import { useEffect, useState } from "react";
import { api } from "../../api";

interface IntervalFetchState<T> {
  data: T | null;
  error: string | null;
}

export function useIntervalFetch<T>(url: string | null, ms: number): IntervalFetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    if (!url) return;
    let cancelled = false;
    const load = () => {
      api<T>(url)
        .then((d) => {
          if (!cancelled) setData(d);
        })
        .catch((e: Error) => {
          if (!cancelled) setError(e.message);
        });
    };
    load();
    const timer = window.setInterval(load, ms);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [url, ms]);

  return { data, error };
}
