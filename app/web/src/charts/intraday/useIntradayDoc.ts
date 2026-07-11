import { useCallback, useEffect, useRef, useState } from "react";
import type { ChartBuilt, ChartDoc, IntradayBuilt, TimeframeKey } from "../../../../shared/types";
import { useQuery } from "../../apiHooks";
import { client } from "../../client";
import { useSSE } from "../../useSSE";

const LIVE_TYPES = new Set(["flow", "intraday"]);

export type ChartDocView = ChartDoc & { prediction_stale?: boolean };

export function resolveIntradayTf(built: IntradayBuilt, preferred: TimeframeKey | null): TimeframeKey {
  if (preferred && preferred in built.timeframes) return preferred;
  if (built.defaultTf in built.timeframes) return built.defaultTf;
  return "m15";
}

export function useIntradayDoc(id: string | null) {
  const [doc, setDoc] = useState<ChartDocView | null>(null);
  const [viewCount, setViewCount] = useState<number | null>(null);
  const [intradayTf, setIntradayTf] = useState<TimeframeKey | null>(null);
  const historyBusyRef = useRef(false);
  const historyExhaustedRef = useRef(false);
  const docRef = useRef<ChartDocView | null>(null);
  const viewCountRef = useRef<number | null>(null);
  const historyTokenRef = useRef<object | null>(null);
  const { data: initialDoc, error } = useQuery<ChartDocView>(
    id ? `charts.get:${id}` : null,
    () => client.charts.get({ id: id! }),
  );

  useEffect(() => {
    setDoc(null);
    setViewCount(null);
    setIntradayTf(null);
    historyBusyRef.current = false;
    historyExhaustedRef.current = false;
    historyTokenRef.current = null;
  }, [id]);

  useEffect(() => {
    if (initialDoc) setDoc(initialDoc);
  }, [initialDoc]);

  docRef.current = doc;
  viewCountRef.current = viewCount;

  const live = Boolean(id && doc && LIVE_TYPES.has(doc.type) && doc.symbol);
  const { degraded } = useSSE<{ built: ChartBuilt; prediction_updated_at?: string; prediction_stale?: boolean }>(
    live && id ? { kind: "chart", id, ...(viewCount ? { count: viewCount } : {}) } : null,
    (d) =>
      setDoc((prev) =>
        prev
          ? { ...prev, built: d.built, prediction_updated_at: d.prediction_updated_at, prediction_stale: d.prediction_stale }
          : prev,
      ),
  );

  const loadHistory = useCallback(() => {
    if (!id) return;
    if (historyBusyRef.current || historyExhaustedRef.current) return;
    const docNow = docRef.current;
    if (!docNow || docNow.built.kind !== "intraday") return;
    const bars = Math.max(...Object.values(docNow.built.timeframes).map((t) => t.candles.length), 0);
    const current = viewCountRef.current ?? bars;
    if (current <= 0) return;
    historyBusyRef.current = true;
    const token = {};
    historyTokenRef.current = token;
    client.charts
      .built({ id, count: current * 2 })
      .then((d) => {
        if (historyTokenRef.current !== token) return;
        const built = d.built as ChartBuilt;
        if (built.kind === "intraday") {
          const grown = Math.max(...Object.values(built.timeframes).map((t) => t.candles.length), 0);
          if (grown <= bars) historyExhaustedRef.current = true;
        }
        setViewCount(d.count);
        setDoc((p) => (p ? { ...p, built } : p));
      })
      .catch(() => {})
      .finally(() => {
        if (historyTokenRef.current === token) {
          historyTokenRef.current = null;
          historyBusyRef.current = false;
        }
      });
  }, [id]);

  return { doc, error, degraded, live, intradayTf, setIntradayTf, loadHistory };
}
