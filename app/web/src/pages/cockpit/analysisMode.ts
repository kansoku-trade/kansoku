export function sameSymbol(a: string, b: string): boolean {
  const norm = (s: string) => s.trim().toUpperCase().replace(/\.US$/, "");
  return norm(a) === norm(b);
}

export function symbolUrl(sym: string, analysisId: string | null): string {
  const base = `/symbol/${encodeURIComponent(sym)}`;
  return analysisId ? `${base}?analysis=${encodeURIComponent(analysisId)}` : base;
}

export interface AnalysisFeedState {
  latestId: string | null;
  newerId: string | null;
}

export const INITIAL_FEED_STATE: AnalysisFeedState = { latestId: null, newerId: null };

/**
 * Pure reducer for an `analysis-created` broadcast.
 * - Ignores broadcasts for a different symbol (defensive: the server keys the
 *   broadcast by the raw stored symbol while the subscription key is normalized).
 * - In "latest" mode (pinnedId is null), adopts the new chart id immediately.
 * - In "pinned" mode, records it as `newerId` so the caller can show a
 *   non-blocking "new analysis available" hint without switching the view.
 */
export function applyAnalysisBroadcast(
  state: AnalysisFeedState,
  pageSymbol: string,
  pinnedId: string | null,
  broadcast: { symbol: string; chartId: string },
): AnalysisFeedState {
  if (!sameSymbol(broadcast.symbol, pageSymbol)) return state;
  if (pinnedId) return { ...state, newerId: broadcast.chartId };
  return { latestId: broadcast.chartId, newerId: null };
}
