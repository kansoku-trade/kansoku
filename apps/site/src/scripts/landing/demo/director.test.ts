import { describe, expect, it } from 'vitest';

import { focusScrollLeft } from './director';

describe('focusScrollLeft', () => {
  it('centres a target that fits the viewport', () => {
    expect(focusScrollLeft(500, 200, 390, 890)).toBe(405);
  });

  it('clamps to the scrollable range', () => {
    expect(focusScrollLeft(0, 40, 390, 890)).toBe(0);
    expect(focusScrollLeft(1240, 40, 390, 890)).toBe(890);
  });

  it('aligns a target wider than the viewport by edge', () => {
    expect(focusScrollLeft(220, 1060, 390, 890, 'start')).toBe(220);
    expect(focusScrollLeft(40, 980, 390, 890, 'end')).toBe(630);
    expect(focusScrollLeft(220, 1060, 390, 890, 'center')).toBe(555);
  });
});
