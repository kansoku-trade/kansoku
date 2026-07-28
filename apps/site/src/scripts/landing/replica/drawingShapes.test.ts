import { describe, expect, it } from 'vitest';
import {
  clampPolyline,
  fibLevels,
  isTwoPointTool,
  MAX_POLYLINE_POINTS,
  measureLabel,
  measureStats,
  shapeIsComplete,
  timeToLogical,
  type DrawingTool,
  type Point,
} from './drawingShapes';

const times = [1000, 1300, 1600, 1900, 2200];
const at = (time: number, price: number): Point => ({ time, price });

describe('fibLevels', () => {
  it('spans 0 to 1 between the two anchors', () => {
    const levels = fibLevels(at(0, 100), at(0, 200));
    expect(levels[0]).toEqual({ ratio: 0, price: 100 });
    expect(levels.at(-1)).toEqual({ ratio: 1, price: 200 });
    expect(levels.find((level) => level.ratio === 0.5)?.price).toBe(150);
  });

  it('works when the anchors run downward', () => {
    const levels = fibLevels(at(0, 200), at(0, 100));
    expect(levels.find((level) => level.ratio === 0.618)?.price).toBeCloseTo(138.2, 5);
  });
});

describe('timeToLogical', () => {
  it('returns the bar index on an exact bar time', () => {
    expect(timeToLogical(times, 1600)).toBe(2);
  });

  it('interpolates between two bars', () => {
    expect(timeToLogical(times, 1450)).toBeCloseTo(1.5, 5);
  });

  it('extrapolates past both ends using the median gap', () => {
    expect(timeToLogical(times, 700)).toBeCloseTo(-1, 5);
    expect(timeToLogical(times, 2500)).toBeCloseTo(5, 5);
  });

  it('is NaN with no bars', () => {
    expect(timeToLogical([], 1000)).toBeNaN();
  });
});

describe('measureStats', () => {
  it('reports signed price move, percent and bar count', () => {
    const stats = measureStats(at(1000, 100), at(1900, 110), times);
    expect(stats.dPrice).toBeCloseTo(10, 5);
    expect(stats.dPct).toBeCloseTo(10, 5);
    expect(stats.bars).toBe(3);
  });

  it('reports a downward move as negative', () => {
    expect(measureStats(at(1000, 100), at(1600, 90), times).dPrice).toBeCloseTo(-10, 5);
  });

  it('avoids dividing by a zero anchor price', () => {
    expect(measureStats(at(1000, 0), at(1600, 5), times).dPct).toBe(0);
  });

  it('formats a signed label', () => {
    expect(measureLabel(measureStats(at(1000, 100), at(1900, 110), times))).toBe(
      '+10.00  +10.00%  3 根',
    );
  });
});

describe('shapeIsComplete', () => {
  it('needs one point for an hline and two for everything else', () => {
    expect(shapeIsComplete('hline', [at(0, 1)])).toBe(true);
    expect(shapeIsComplete('trendline', [at(0, 1)])).toBe(false);
    expect(shapeIsComplete('trendline', [at(0, 1), at(1, 2)])).toBe(true);
    expect(shapeIsComplete('polyline', [at(0, 1)])).toBe(false);
  });
});

describe('clampPolyline', () => {
  it('caps the point count', () => {
    const many = Array.from({ length: 40 }, (_, i) => at(i, i));
    expect(clampPolyline(many)).toHaveLength(MAX_POLYLINE_POINTS);
  });

  it('leaves a short polyline untouched', () => {
    const few = [at(0, 1), at(1, 2)];
    expect(clampPolyline(few)).toBe(few);
  });
});

describe('isTwoPointTool', () => {
  it('covers exactly the drag tools', () => {
    const drag: DrawingTool[] = ['measure', 'trendline', 'rect', 'fib'];
    const rest: DrawingTool[] = ['cursor', 'hline', 'polyline', 'off'];
    expect(drag.every((tool) => isTwoPointTool(tool))).toBe(true);
    expect(rest.some((tool) => isTwoPointTool(tool))).toBe(false);
  });
});
