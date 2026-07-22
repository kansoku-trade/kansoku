import { capMarkersPerBar } from '@kansoku/shared/markerPolicy';
import type { OverlayGroup, SeriesMarker } from '@kansoku/shared/types';
import type { IndicatorToggleKey, MarkerRange } from './useIndicatorToggles';

const GROUP_TOGGLE: Record<OverlayGroup, IndicatorToggleKey> = {
  'ai': 'ai',
  'divergence': 'divergence',
  'macdBeichi': 'macdBeichi',
  'pattern123': 'pattern123',
  'sb': 'sb',
  'candle': 'candle',
  'fenxing': 'chanFenxing',
  'bi': 'chanBi',
  'xianduan': 'chanXianduan',
  'zhongshu': 'chanZhongshu',
  'chan-buy1': 'chanBuySell1',
  'chan-sell1': 'chanBuySell1',
  'chan-buy2': 'chanBuySell2',
  'chan-sell2': 'chanBuySell2',
  'chan-buy3': 'chanBuySell3',
  'chan-sell3': 'chanBuySell3',
};

export function filterVisibleOverlayItems<T extends { group?: OverlayGroup; recent?: boolean }>(
  items: T[],
  toggles: Record<IndicatorToggleKey, boolean>,
  range: MarkerRange,
): T[] {
  return items.filter(
    (item) =>
      (item.group === undefined || toggles[GROUP_TOGGLE[item.group]]) &&
      (range === 'all' || item.recent !== false),
  );
}

export function selectVisibleMarkers(
  markers: SeriesMarker[],
  toggles: Record<IndicatorToggleKey, boolean>,
  range: MarkerRange,
): SeriesMarker[] {
  return capMarkersPerBar(filterVisibleOverlayItems(markers, toggles, range));
}
