import type {
  Connector,
  IntradayBuilt,
  IntradayTfData,
  IntradayTfSummary,
  OverlayGroup,
  SeriesMarker,
  TimeframeKey,
} from '@kansoku/shared/types';
import { featureStateSync } from './features.js';

const PATTERN_GROUPS = new Set<OverlayGroup>(['divergence', 'macdBeichi', 'pattern123', 'candle']);

function stripOverlay<T extends SeriesMarker | Connector>(items: T[]): T[] {
  const kept = items.filter((item) => !item.group || !PATTERN_GROUPS.has(item.group));
  return kept.length === items.length ? items : kept;
}

function stripTfData(tf: IntradayTfData): IntradayTfData {
  return {
    ...tf,
    autoDivergence: [],
    autoBeichi: [],
    ...(tf.pattern123 !== undefined ? { pattern123: [] } : {}),
    ...(tf.secondBreakouts !== undefined ? { secondBreakouts: [] } : {}),
    markers: stripOverlay(tf.markers ?? []),
    priceConnectors: stripOverlay(tf.priceConnectors ?? []),
    macdConnectors: stripOverlay(tf.macdConnectors ?? []),
  };
}

function stripTfSummary(summary: IntradayTfSummary): IntradayTfSummary {
  return {
    ...summary,
    divergence_candidates: [],
    beichi_candidates: [],
    ...(summary.candle_patterns !== undefined ? { candle_patterns: [] } : {}),
    ...(summary.pattern_123 !== undefined ? { pattern_123: [] } : {}),
    ...(summary.second_breakouts !== undefined ? { second_breakouts: [] } : {}),
  };
}

export function stripProAnnotations(built: IntradayBuilt): IntradayBuilt {
  const patternsActive = featureStateSync('auto-patterns') === 'active';
  const wallsActive = featureStateSync('options-walls') === 'active';
  if (patternsActive && wallsActive) return built;

  let timeframes = built.timeframes;
  let sidebar = built.sidebar;

  if (!patternsActive) {
    timeframes = Object.fromEntries(
      (Object.entries(timeframes) as [TimeframeKey, IntradayTfData][]).map(([tf, data]) => [
        tf,
        stripTfData(data),
      ]),
    ) as Record<TimeframeKey, IntradayTfData>;

    sidebar = {
      ...sidebar,
      technicals: Object.fromEntries(
        (Object.entries(sidebar.technicals) as [TimeframeKey, IntradayTfSummary][]).map(
          ([tf, summary]) => [tf, stripTfSummary(summary)],
        ),
      ) as Record<TimeframeKey, IntradayTfSummary>,
    };
  }

  if (!wallsActive) {
    sidebar = { ...sidebar, optionsLevels: null };
  }

  return { ...built, timeframes, sidebar };
}
