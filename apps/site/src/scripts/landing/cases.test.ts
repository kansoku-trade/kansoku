import { describe, expect, it } from 'vitest';

import { heroCases } from './cases';

describe('heroCases', () => {
  it('sums bull, base, and bear to 100 for every case', () => {
    for (const item of heroCases) {
      const total = item.probabilities.bull + item.probabilities.base + item.probabilities.bear;
      expect(total).toBe(100);
    }
  });

  it('has exactly 7 nodes per case', () => {
    for (const item of heroCases) {
      expect(item.nodes).toHaveLength(7);
    }
  });

  it('includes at least one neutral-tone case', () => {
    expect(heroCases.some((item) => item.tone === 'neutral')).toBe(true);
  });

  it('has unique symbols', () => {
    const symbols = heroCases.map((item) => item.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
  });
});
