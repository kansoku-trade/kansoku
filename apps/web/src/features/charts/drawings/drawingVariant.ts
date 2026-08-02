import type { AnalyticsVariant } from '@web/lib/analytics';
import type { DrawingTool } from './drawingsMachine';

const VARIANT_TOOLS = new Set<string>(['hline', 'trendline', 'rect', 'fib', 'polyline']);

/**
 * `measure` is a drawing tool the ingest schema has no variant for, so it reports the feature
 * with no breakdown rather than being dropped or smuggled in under a neighbouring name — the
 * Worker rejects the whole event on an unknown variant, and a silent 400 would lose the use
 * entirely.
 */
export function drawingVariantOf(tool: DrawingTool): AnalyticsVariant | undefined {
  return VARIANT_TOOLS.has(tool) ? (tool as AnalyticsVariant) : undefined;
}
