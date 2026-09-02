import { describe, expect, it } from 'vitest';

import { barShare, DEMO_CANVASES, maxAbs, signedText } from './canvasDocs';

describe('DEMO_CANVASES', () => {
  it('ships four named canvases with a conclusion and at most four stats', () => {
    expect(DEMO_CANVASES).toHaveLength(4);
    for (const canvas of DEMO_CANVASES) {
      expect(canvas.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(canvas.title.length).toBeGreaterThan(0);
      expect(canvas.conclusion.length).toBeGreaterThan(0);
      expect(canvas.stats.length).toBeGreaterThan(0);
      expect(canvas.stats.length).toBeLessThanOrEqual(4);
      expect(canvas.compare.length).toBeGreaterThan(1);
      expect(canvas.compareMetrics.length).toBeGreaterThan(0);
    }
  });

  it('gives every canvas scenarios that sum to 100 and a current timeline point', () => {
    for (const canvas of DEMO_CANVASES) {
      expect(canvas.scenarios!.reduce((sum, item) => sum + item.probability, 0)).toBe(100);
      expect(canvas.timeline?.some((item) => item.current)).toBe(true);
      expect(canvas.coverage.some((item) => item.status === 'missing')).toBe(true);
    }
  });

  it('keeps slugs unique', () => {
    const slugs = DEMO_CANVASES.map((canvas) => canvas.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('keeps the MU session canvas as the full five-part example', () => {
    const session = DEMO_CANVASES.find((canvas) => canvas.slug === 'mu-session');
    expect(session).toBeDefined();
    expect(session!.stats).toHaveLength(4);
    expect(session!.compare).toHaveLength(4);
    expect(session!.compareMetrics).toHaveLength(3);
    expect(session!.flow?.length).toBeGreaterThan(3);
    expect(session!.flow!.reduce((sum, point) => sum + point.y, 0)).toBeCloseTo(31.5);
    expect(session!.scenarios).toHaveLength(3);
    expect(session!.scenarios!.reduce((sum, item) => sum + item.probability, 0)).toBe(100);
    expect(session!.timeline?.some((item) => item.current)).toBe(true);
  });
});

describe('barShare', () => {
  it('scales a value against the peak absolute', () => {
    expect(maxAbs([-9.4, 31.5, 18.2])).toBe(31.5);
    expect(barShare(15.75, 31.5)).toBe(0.5);
    expect(barShare(-31.5, 31.5)).toBe(1);
    expect(barShare(4, 0)).toBe(0);
  });
});

describe('signedText', () => {
  it('keeps the sign visible on both sides of zero', () => {
    expect(signedText(-2.4, '%')).toBe('-2.4%');
    expect(signedText(31.5)).toBe('+31.5');
    expect(signedText(0, '%')).toBe('0%');
  });
});
