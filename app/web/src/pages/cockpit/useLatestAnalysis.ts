import { useEffect, useState } from "react";
import type { ChartDoc, SymbolAnalysisRow } from "../../../../shared/types";
import { useQuery } from "../../apiHooks";
import { navigate, useQueryParam } from "../../router";
import { subscribeChannel } from "../../wsHub";
import { applyAnalysisBroadcast, INITIAL_FEED_STATE, symbolUrl, type AnalysisFeedState } from "./analysisMode";

type LatestDoc = ChartDoc & { url: string; prediction_stale?: boolean };

interface AnalysisCreatedPayload {
  type?: string;
  symbol?: string;
  chartId?: string;
}

export interface LatestAnalysisState {
  mode: "latest" | "pinned";
  activeId: string | null;
  latestChecked: boolean;
  latestError: string | null;
  hasNewer: boolean;
  jumpToLatest: () => void;
  goToAnalysis: (id: string | null) => void;
  analyses: SymbolAnalysisRow[];
}

export function useLatestAnalysis(sym: string): LatestAnalysisState {
  const pinnedId = useQueryParam("analysis");
  const mode: "latest" | "pinned" = pinnedId ? "pinned" : "latest";

  const latestUrl = `/api/symbols/${encodeURIComponent(sym)}/latest`;
  const { data: latestDoc, failure: latestFailure, loading: latestLoading, reload: reloadLatest } =
    useQuery<LatestDoc>(latestUrl);

  const analysesUrl = `/api/symbols/${encodeURIComponent(sym)}/analyses`;
  const { data: analyses, reload: reloadAnalyses } = useQuery<SymbolAnalysisRow[]>(analysesUrl);

  const [feed, setFeed] = useState<AnalysisFeedState>(INITIAL_FEED_STATE);

  useEffect(() => {
    setFeed(INITIAL_FEED_STATE);
  }, [sym, pinnedId]);

  useEffect(() => {
    const off = subscribeChannel(
      { kind: "analyses", symbol: sym },
      (payload) => {
        const msg = payload as AnalysisCreatedPayload;
        if (msg.type !== "analysis-created" || !msg.symbol || !msg.chartId) return;
        const broadcast = { symbol: msg.symbol, chartId: msg.chartId };
        setFeed((prev) => applyAnalysisBroadcast(prev, sym, pinnedId, broadcast));
        reloadAnalyses();
        if (!pinnedId) reloadLatest();
      },
      () => {},
    );
    return off;
  }, [sym, pinnedId, reloadAnalyses, reloadLatest]);

  const activeId = mode === "pinned" ? pinnedId : (feed.latestId ?? latestDoc?.id ?? null);

  const goToAnalysis = (id: string | null) => navigate(symbolUrl(sym, id));

  return {
    mode,
    activeId,
    latestChecked: mode === "pinned" ? true : !latestLoading,
    latestError: mode === "latest" && latestFailure && latestFailure.status !== 404 ? latestFailure.message : null,
    hasNewer: mode === "pinned" && Boolean(feed.newerId),
    jumpToLatest: () => goToAnalysis(null),
    goToAnalysis,
    analyses: analyses ?? [],
  };
}
