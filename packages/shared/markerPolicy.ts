import type { SeriesMarker } from './types.js';

export const MARKER_GROUP_RANK: Record<string, number> = {
  'ai': 0,
  'divergence': 1,
  'chan-buy1': 1,
  'chan-sell1': 1,
  'macdBeichi': 2,
  'chan-buy2': 2,
  'chan-sell2': 2,
  'chan-buy3': 2,
  'chan-sell3': 2,
  'pattern123': 3,
  'sb': 3,
  'candle': 4,
  'fenxing': 5,
};

export const MAX_MARKERS_PER_BAR = 2;

export function dedupeMarkers(markers: SeriesMarker[]): SeriesMarker[] {
  const bySlot = new Map<string, SeriesMarker>();
  const deduped: SeriesMarker[] = [];
  for (const marker of markers) {
    const slot = `${marker.time}|${marker.group ?? ''}|${marker.text ?? ''}`;
    const previous = bySlot.get(slot);
    if (!previous) {
      const copy = { ...marker };
      bySlot.set(slot, copy);
      deduped.push(copy);
      continue;
    }
    if (
      marker.tooltip &&
      previous.tooltip !== marker.tooltip &&
      !previous.tooltip?.includes(marker.tooltip)
    ) {
      previous.tooltip = `${previous.tooltip}\n———\n${marker.tooltip}`;
    }
    if (previous.recent === false && marker.recent !== false) previous.recent = marker.recent;
  }

  return deduped.sort(
    (a, b) =>
      a.time - b.time ||
      (MARKER_GROUP_RANK[a.group ?? ''] ?? 9) - (MARKER_GROUP_RANK[b.group ?? ''] ?? 9),
  );
}

export function capMarkersPerBar(
  markers: SeriesMarker[],
  cap = MAX_MARKERS_PER_BAR,
): SeriesMarker[] {
  const byTime = new Map<number, SeriesMarker[]>();
  for (const marker of dedupeMarkers(markers)) {
    const list = byTime.get(marker.time);
    if (list) list.push(marker);
    else byTime.set(marker.time, [marker]);
  }

  const output: SeriesMarker[] = [];
  for (const group of byTime.values()) {
    if (group.length <= cap) {
      output.push(...group);
      continue;
    }
    const keep = group.slice(0, cap).map((marker) => ({ ...marker }));
    const dropped = group
      .slice(cap)
      .map((marker) => marker.tooltip?.split('\n')[0])
      .filter((tooltip): tooltip is string => Boolean(tooltip));
    if (dropped.length) {
      const last = keep.at(-1)!;
      last.tooltip = `${last.tooltip}\n———\n本根另有：${dropped.join('；')}`;
    }
    output.push(...keep);
  }
  return output;
}
