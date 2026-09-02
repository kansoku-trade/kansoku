import { describe, expect, it } from 'vitest';
import { DEV_DOCK_ITEMS, isItemPinned, selectBarLayout } from './items';

describe('selectBarLayout', () => {
  it('pins defaults and lets overrides win in both directions', () => {
    const layout = selectBarLayout(DEV_DOCK_ITEMS, { fps: false, mesurer: true });
    expect(layout.center?.id).toBe('route-path');
    expect(layout.right.map((item) => item.id)).toEqual(['memory', 'cpu', 'gpu', 'mesurer']);
  });

  it('drops the center readout when unpinned', () => {
    const layout = selectBarLayout(DEV_DOCK_ITEMS, { 'route-path': false });
    expect(layout.center).toBeUndefined();
    expect(isItemPinned(DEV_DOCK_ITEMS[0], { 'route-path': false })).toBe(false);
  });
});
