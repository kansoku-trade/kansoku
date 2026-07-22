import { describe, expect, it } from 'vitest';
import type { SeriesMarker } from '@kansoku/shared/types';
import { INDICATOR_TOGGLE_KEYS, type IndicatorToggleKey } from './useIndicatorToggles';
import { selectVisibleMarkers } from './markerSelection';

const toggles = (on: IndicatorToggleKey[]) =>
  Object.fromEntries(INDICATOR_TOGGLE_KEYS.map((key) => [key, on.includes(key)])) as Record<
    IndicatorToggleKey,
    boolean
  >;

const marker = (group: SeriesMarker['group'], tooltip: string): SeriesMarker => ({
  time: 1_000,
  position: 'aboveBar',
  color: '#fff',
  shape: 'circle',
  text: group ?? '',
  tooltip,
  group,
});

describe('intraday marker selection', () => {
  it('applies the per-bar cap after layer filtering so hidden groups cannot suppress visible ones', () => {
    const markers = [
      marker('ai', 'AI 标注'),
      marker('divergence', '自动背离'),
      marker('pattern123', '123 结构'),
    ];

    expect(
      selectVisibleMarkers(markers, toggles(['ai', 'divergence', 'pattern123']), 'all'),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ group: 'ai' }),
        expect.objectContaining({ group: 'divergence' }),
      ]),
    );

    const withoutAi = selectVisibleMarkers(markers, toggles(['divergence', 'pattern123']), 'all');
    expect(withoutAi.map((item) => item.group)).toEqual(['divergence', 'pattern123']);
  });

  it('honors the recent range before applying the per-bar cap', () => {
    const markers = [
      marker('divergence', '较早的背离'),
      { ...marker('pattern123', '近期 123'), recent: true },
      { ...marker('sb', '近期 SB'), recent: true },
    ];
    markers[0].recent = false;

    expect(
      selectVisibleMarkers(markers, toggles(['divergence', 'pattern123', 'sb']), 'recent').map(
        (item) => item.group,
      ),
    ).toEqual(['pattern123', 'sb']);
  });
});
