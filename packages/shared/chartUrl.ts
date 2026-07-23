import type { ChartMeta, ChartType } from './types.js';
import { marketDate } from './time.js';

export const SYMBOL_TYPES = new Set<ChartType>(['intraday', 'sepa']);

export type ChartUrlDoc = Pick<ChartMeta, 'id' | 'type' | 'symbol' | 'created_at'>;

export function symbolAnalysisPath(symbol: string, analysisId: string | null): string {
  const base = `/symbol/${encodeURIComponent(symbol)}`;
  return analysisId ? `${base}?analysis=${encodeURIComponent(analysisId)}` : base;
}

export function symbolLivePath(symbol: string): string {
  return `${symbolAnalysisPath(symbol, null)}?view=live`;
}

export function symbolSepaPath(symbol: string, analysisId?: string | null): string {
  const base = `/symbol/sepa/${encodeURIComponent(symbol)}`;
  return analysisId ? `${base}?analysis=${encodeURIComponent(analysisId)}` : base;
}

/**
 * Single source of truth for "chart doc -> page it lives on".
 * Symbol charts (intraday/sepa) pin the symbol page to this analysis;
 * cross-section charts (flow/cohort) land on the home page for that market date.
 */
export function chartTargetPath(doc: ChartUrlDoc): string {
  if (SYMBOL_TYPES.has(doc.type) && doc.symbol) {
    return symbolAnalysisPath(doc.symbol, doc.id);
  }
  return `/?date=${marketDate(doc.created_at)}`;
}
