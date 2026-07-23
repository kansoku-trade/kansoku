import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChartDocView } from '@web/features/charts/intraday/useIntradayDoc';
import { errorMessage } from '@web/lib/api';
import { client } from '@web/lib/client';

export interface SepaRefreshController {
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useSepaRefresh(
  doc: ChartDocView | null,
  reload: () => void,
): SepaRefreshController {
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoTriedRef = useRef<Set<string>>(new Set());
  const tokenRef = useRef<object | null>(null);
  const mountedRef = useRef(true);

  const docId = doc?.id ?? null;
  const isResearchOrigin = doc?.input.origin === 'research';
  const stale = doc?.sepa_stale === true;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      tokenRef.current = null;
    };
  }, []);

  useEffect(() => {
    tokenRef.current = null;
    setRefreshing(false);
    setError(null);
  }, [docId]);

  const refresh = useCallback(async () => {
    if (!docId) return;
    if (tokenRef.current) return;
    const token = {};
    tokenRef.current = token;
    setRefreshing(true);
    setError(null);
    try {
      await client.charts.update({ id: docId, refresh: true });
      const superseded = tokenRef.current !== token;
      if (mountedRef.current && !superseded) reload();
    } catch (caught) {
      const superseded = tokenRef.current !== token;
      if (mountedRef.current && !superseded) setError(errorMessage(caught));
    } finally {
      if (mountedRef.current && tokenRef.current === token) {
        tokenRef.current = null;
        setRefreshing(false);
      }
    }
  }, [docId, reload]);

  useEffect(() => {
    if (!docId || !isResearchOrigin || !stale) return;
    if (autoTriedRef.current.has(docId)) return;
    autoTriedRef.current.add(docId);
    void refresh();
  }, [docId, isResearchOrigin, stale, refresh]);

  return { refreshing, error, refresh };
}
