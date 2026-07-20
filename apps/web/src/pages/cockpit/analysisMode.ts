import { symbolAnalysisPath, symbolLivePath } from '@kansoku/shared/chartUrl';

export {
  sameSymbol,
  applyAnalysisBroadcast,
  INITIAL_FEED_STATE,
  type AnalysisFeedState,
} from '@kansoku/shared/analysisFeed';

export type AnalysisViewMode = 'live' | 'latest' | 'pinned';

export function resolveAnalysisViewMode(
  view: string | null,
  analysisId: string | null,
): AnalysisViewMode {
  if (view === 'live') return 'live';
  return analysisId ? 'pinned' : 'latest';
}

export function resolveEffectiveMode(
  mode: AnalysisViewMode,
  latestId: string | null,
  todayEastern: string,
): AnalysisViewMode {
  if (mode !== 'latest') return mode;
  if (!latestId) return 'latest';
  return latestId.slice(0, 10) === todayEastern ? 'latest' : 'live';
}

export const symbolUrl = symbolAnalysisPath;
export const symbolLiveUrl = symbolLivePath;
