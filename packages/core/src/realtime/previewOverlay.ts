import type { ChartDoc } from '@kansoku/shared/types';

export function overlayAnalysisInput(
  previewInput: Record<string, unknown>,
  latestDoc: ChartDoc | null,
): Record<string, unknown> {
  if (!latestDoc) return previewInput;
  const analysisInput = latestDoc.input as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...previewInput };
  if ('prediction' in analysisInput) merged.prediction = analysisInput.prediction;
  if ('context' in analysisInput) merged.context = analysisInput.context;
  return merged;
}
