import { symbolAnalysisPath, symbolLivePath } from "../../../../../packages/shared/chartUrl";

export {
  sameSymbol,
  applyAnalysisBroadcast,
  INITIAL_FEED_STATE,
  type AnalysisFeedState,
} from "../../../../../packages/shared/analysisFeed";

export type AnalysisViewMode = "live" | "latest" | "pinned";

export function resolveAnalysisViewMode(view: string | null, analysisId: string | null): AnalysisViewMode {
  if (view === "live") return "live";
  return analysisId ? "pinned" : "latest";
}

export const symbolUrl = symbolAnalysisPath;
export const symbolLiveUrl = symbolLivePath;
