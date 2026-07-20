import { useEffect, useState } from 'react';
import type { ChartDoc, SymbolAnalysisRow } from '@kansoku/shared/types';
import { useQuery } from '@web/apiHooks';
import { client } from '@web/client';
import { easternToday } from '@web/lib/easternDate';
import { navigate, useQueryParam } from '@web/router';
import { subscribeChannel } from '@web/wsHub';
import {
  applyAnalysisBroadcast,
  INITIAL_FEED_STATE,
  resolveAnalysisViewMode,
  resolveEffectiveMode,
  symbolLiveUrl,
  symbolUrl,
  type AnalysisFeedState,
  type AnalysisViewMode,
} from './analysisMode';

type LatestDoc = ChartDoc & { url: string; prediction_stale?: boolean };

interface AnalysisCreatedPayload {
  type?: string;
  symbol?: string;
  chartId?: string;
  chartType?: string;
}

export interface LatestAnalysisState {
  mode: AnalysisViewMode;
  activeId: string | null;
  latestChecked: boolean;
  latestError: string | null;
  hasNewer: boolean;
  jumpToLatest: () => void;
  goToLive: () => void;
  goToAnalysis: (id: string | null) => void;
  analyses: SymbolAnalysisRow[];
}

export function useLatestAnalysis(sym: string): LatestAnalysisState {
  const pinnedId = useQueryParam('analysis');
  const requestedView = useQueryParam('view');
  const mode = resolveAnalysisViewMode(requestedView, pinnedId);

  const latestKey = mode === 'latest' ? `symbols.latest:${sym}` : null;
  const {
    data: latestDoc,
    failure: latestFailure,
    loading: latestLoading,
    reload: reloadLatest,
  } = useQuery<LatestDoc>(latestKey, () => client.symbols.latest({ sym }));

  const analysesKey = `symbols.analyses:${sym}`;
  const { data: analyses, reload: reloadAnalyses } = useQuery<SymbolAnalysisRow[]>(
    analysesKey,
    () => client.symbols.analyses({ sym }),
  );

  const [feed, setFeed] = useState<AnalysisFeedState>(INITIAL_FEED_STATE);

  useEffect(() => {
    setFeed(INITIAL_FEED_STATE);
  }, [sym, mode, pinnedId]);

  useEffect(() => {
    const off = subscribeChannel(
      { kind: 'analyses', symbol: sym },
      (payload) => {
        const msg = payload as AnalysisCreatedPayload;
        if (msg.type !== 'analysis-created' || !msg.symbol || !msg.chartId || !msg.chartType)
          return;
        const broadcast = { symbol: msg.symbol, chartId: msg.chartId, chartType: msg.chartType };
        setFeed((prev) =>
          applyAnalysisBroadcast(prev, sym, mode === 'pinned' ? pinnedId : null, broadcast),
        );
        reloadAnalyses();
        if (mode === 'latest') reloadLatest();
      },
      () => {},
    );
    return off;
  }, [sym, mode, pinnedId, reloadAnalyses, reloadLatest]);

  const activeId =
    mode === 'pinned'
      ? pinnedId
      : mode === 'latest'
        ? (feed.latestId ?? latestDoc?.id ?? null)
        : null;

  const goToAnalysis = (id: string | null) => navigate(symbolUrl(sym, id));

  return {
    mode: resolveEffectiveMode(mode, activeId, easternToday()),
    activeId,
    latestChecked: mode !== 'latest' || !latestLoading,
    latestError:
      mode === 'latest' && latestFailure && latestFailure.status !== 404
        ? latestFailure.message
        : null,
    hasNewer: mode === 'pinned' && Boolean(feed.newerId),
    jumpToLatest: () => goToAnalysis(null),
    goToLive: () => navigate(symbolLiveUrl(sym)),
    goToAnalysis,
    analyses: analyses ?? [],
  };
}
