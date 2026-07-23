import { describe, expect, it } from 'vitest';
import type { IntradayBuilt } from '@kansoku/shared/types';
import { withPreviewLevels } from './timeframes';

const built = {
  kind: 'intraday',
  timeframes: { m5: {}, m15: {}, h1: {} },
  defaultTf: 'm15',
  entryPlan: null,
  sidebar: { prediction: null },
} as unknown as IntradayBuilt;

const levels = [
  { price: 101.5, label: '阻力' },
  { price: 98.2, label: '支撑' },
];

describe('withPreviewLevels', () => {
  it('grafts the levels onto the built doc for the renderer to draw', () => {
    const next = withPreviewLevels(built, levels);

    expect(next).not.toBe(built);
    expect(next.previewLevels).toEqual(levels);
    expect(next.timeframes).toBe(built.timeframes);
  });

  it('does not mutate the input built', () => {
    const snapshot = structuredClone(built);

    withPreviewLevels(built, levels);

    expect(built.previewLevels).toBeUndefined();
    expect(built).toEqual(snapshot);
  });

  it('returns the doc untouched when there are no levels to draw', () => {
    expect(withPreviewLevels(built, [])).toBe(built);
    expect(withPreviewLevels(built, undefined)).toBe(built);
  });
});
