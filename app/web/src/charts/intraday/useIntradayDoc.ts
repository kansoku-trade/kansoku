import { useEffect, useRef, useState } from "react";
import type { ChartBuilt, ChartDoc, IntradayBuilt, TimeframeKey } from "../../../../shared/types";
import { api } from "../../api";
import { useSSE } from "../../useSSE";

const LIVE_TYPES = new Set(["flow", "intraday"]);
const HISTORY_MAX_COUNT = 1000;

export type ChartDocView = ChartDoc & { prediction_stale?: boolean };

export function resolveIntradayTf(built: IntradayBuilt, preferred: TimeframeKey | null): TimeframeKey {
  if (preferred && preferred in built.timeframes) return preferred;
  if (built.defaultTf in built.timeframes) return built.defaultTf;
  return "m15";
}

export function useIntradayDoc(id: string | null) {
  const [doc, setDoc] = useState<ChartDocView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewCount, setViewCount] = useState<number | null>(null);
  const [intradayTf, setIntradayTf] = useState<TimeframeKey | null>(null);
  const historyBusyRef = useRef(false);
  const docRef = useRef<ChartDocView | null>(null);
  const viewCountRef = useRef<number | null>(null);

  useEffect(() => {
    setDoc(null);
    setError(null);
    setViewCount(null);
    setIntradayTf(null);
    historyBusyRef.current = false;
    if (!id) return;
    api<ChartDocView>(`/api/charts/${encodeURIComponent(id)}`)
      .then(setDoc)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  docRef.current = doc;
  viewCountRef.current = viewCount;

  const live = Boolean(id && doc && LIVE_TYPES.has(doc.type) && doc.symbol);
  const { degraded } = useSSE<{ built: ChartBuilt; prediction_updated_at?: string; prediction_stale?: boolean }>(
    live && id ? `/api/stream/charts/${encodeURIComponent(id)}${viewCount ? `?count=${viewCount}` : ""}` : null,
    (d) =>
      setDoc((prev) =>
        prev
          ? { ...prev, built: d.built, prediction_updated_at: d.prediction_updated_at, prediction_stale: d.prediction_stale }
          : prev,
      ),
  );

  const loadHistory = () => {
    if (!id) return;
    if (historyBusyRef.current) return;
    const docNow = docRef.current;
    if (!docNow || docNow.built.kind !== "intraday") return;
    const bars = Math.max(...Object.values(docNow.built.timeframes).map((t) => t.candles.length), 0);
    const current = viewCountRef.current ?? bars;
    if (current <= 0 || current >= HISTORY_MAX_COUNT) return;
    historyBusyRef.current = true;
    api<{ built: ChartBuilt; count: number }>(
      `/api/charts/${encodeURIComponent(id)}/built?count=${Math.min(current * 2, HISTORY_MAX_COUNT)}`,
    )
      .then((d) => {
        setViewCount(d.count);
        setDoc((p) => (p ? { ...p, built: d.built } : p));
      })
      .catch(() => undefined)
      .finally(() => {
        historyBusyRef.current = false;
      });
  };

  return { doc, error, degraded, live, intradayTf, setIntradayTf, loadHistory };
}
