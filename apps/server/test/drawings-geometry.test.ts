import { describe, expect, it } from "vitest";
import type { AnnotationPoint } from "@kansoku/shared/types";
import {
  FIB_RATIOS,
  distToSegment,
  fibLevels,
  hitTest,
  logicalToTime,
  measureStats,
  timeToLogical,
  type ShapeGeom,
} from "@kansoku/shared/drawings";

describe("fibLevels", () => {
  it("ascending p1/p2: ratio 0 at p1, 1 at p2", () => {
    const p1: AnnotationPoint = { time: 0, price: 100 };
    const p2: AnnotationPoint = { time: 10, price: 200 };
    const levels = fibLevels(p1, p2);
    expect(levels.map((l) => l.ratio)).toEqual([...FIB_RATIOS]);
    expect(levels[0].price).toBe(100);
    expect(levels[levels.length - 1].price).toBe(200);
    expect(levels.find((l) => l.ratio === 0.5)!.price).toBe(150);
  });

  it("descending p1/p2: ratio 0 at p1, 1 at p2", () => {
    const p1: AnnotationPoint = { time: 0, price: 200 };
    const p2: AnnotationPoint = { time: 10, price: 100 };
    const levels = fibLevels(p1, p2);
    expect(levels[0].price).toBe(200);
    expect(levels[levels.length - 1].price).toBe(100);
    expect(levels.find((l) => l.ratio === 0.5)!.price).toBe(150);
  });
});

describe("timeToLogical", () => {
  const bars = [100, 200, 300, 400, 500];

  it("exact hit returns its index", () => {
    expect(timeToLogical(bars, 300)).toBe(2);
  });

  it("midpoint between bars returns fraction", () => {
    expect(timeToLogical(bars, 250)).toBe(1.5);
  });

  it("extrapolates past last bar with uniform spacing", () => {
    expect(timeToLogical(bars, 600)).toBe(5);
    expect(timeToLogical(bars, 700)).toBe(6);
  });

  it("extrapolates before first bar with uniform spacing", () => {
    expect(timeToLogical(bars, 0)).toBe(-1);
    expect(timeToLogical(bars, -100)).toBe(-2);
  });

  it("irregular spacing uses median gap for extrapolation", () => {
    const irregular = [0, 10, 20, 30, 130];
    expect(timeToLogical(irregular, 140)).toBeCloseTo(5);
  });

  it("empty barTimes returns NaN", () => {
    expect(timeToLogical([], 100)).toBeNaN();
  });

  it("single bar falls back to 60s interval for extrapolation", () => {
    expect(timeToLogical([1000], 1060)).toBe(1);
    expect(timeToLogical([1000], 940)).toBe(-1);
  });
});

describe("logicalToTime", () => {
  const bars = [100, 200, 300, 400, 500];

  it("round-trips exact indices", () => {
    for (let i = 0; i < bars.length; i++) {
      expect(logicalToTime(bars, i)).toBe(bars[i]);
    }
  });

  it("round-trips fractions", () => {
    expect(logicalToTime(bars, 1.5)).toBe(250);
  });

  it("round-trips out-of-range logicals", () => {
    expect(logicalToTime(bars, 5)).toBe(600);
    expect(logicalToTime(bars, -1)).toBe(0);
  });

  it("empty barTimes returns NaN", () => {
    expect(logicalToTime([], 1)).toBeNaN();
  });
});

describe("distToSegment", () => {
  it("perpendicular distance to interior of segment", () => {
    expect(distToSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
  });

  it("clamps to nearest endpoint beyond segment", () => {
    expect(distToSegment({ x: 20, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(10);
  });

  it("degenerate segment a===b measures point distance", () => {
    expect(distToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
  });
});

describe("hitTest", () => {
  it("trendline: body hit within tolerance, miss just outside", () => {
    const shape: ShapeGeom = { kind: "trendline", pixels: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
    expect(hitTest(shape, { x: 50, y: 5 })).toEqual({ type: "body" });
    expect(hitTest(shape, { x: 50, y: 10 })).toBeNull();
  });

  it("trendline: endpoint handle takes precedence over body", () => {
    const shape: ShapeGeom = { kind: "trendline", pixels: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
    expect(hitTest(shape, { x: 2, y: 2 })).toEqual({ type: "point", index: 0 });
    expect(hitTest(shape, { x: 98, y: 2 })).toEqual({ type: "point", index: 1 });
  });

  it("hline: body hit anywhere near y, miss far from y", () => {
    const shape: ShapeGeom = { kind: "hline", pixels: [{ x: 0, y: 50 }] };
    expect(hitTest(shape, { x: 500, y: 53 })).toEqual({ type: "body" });
    expect(hitTest(shape, { x: 500, y: 100 })).toBeNull();
  });

  it("hline: single handle at pixels[0]", () => {
    const shape: ShapeGeom = { kind: "hline", pixels: [{ x: 0, y: 50 }] };
    expect(hitTest(shape, { x: 2, y: 51 })).toEqual({ type: "point", index: 0 });
  });

  it("rect: border hit but interior center miss", () => {
    const shape: ShapeGeom = { kind: "rect", pixels: [{ x: 0, y: 0 }, { x: 100, y: 100 }] };
    expect(hitTest(shape, { x: 50, y: 1 })).toEqual({ type: "body" });
    expect(hitTest(shape, { x: 50, y: 50 })).toBeNull();
  });

  it("fib: respects tolerance and x-range", () => {
    const shape: ShapeGeom = { kind: "fib", pixels: [{ x: 0, y: 0 }, { x: 100, y: 100 }] };
    expect(hitTest(shape, { x: 50, y: 0 })).toEqual({ type: "body" });
    expect(hitTest(shape, { x: 50, y: 30 })).toBeNull();
    expect(hitTest(shape, { x: 200, y: 0 })).toBeNull();
    expect(hitTest(shape, { x: 150, y: 0 }, { fibXRange: [0, 200] })).toEqual({ type: "body" });
  });

  it("polyline: body hit on a middle segment", () => {
    const shape: ShapeGeom = {
      kind: "polyline",
      pixels: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 50 },
      ],
    };
    expect(hitTest(shape, { x: 75, y: 25 })).toEqual({ type: "body" });
  });

  it("polyline: handle takes precedence over body", () => {
    const shape: ShapeGeom = {
      kind: "polyline",
      pixels: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 50 },
      ],
    };
    expect(hitTest(shape, { x: 51, y: 1 })).toEqual({ type: "point", index: 1 });
  });

  it("polyline: miss far from every segment and handle", () => {
    const shape: ShapeGeom = {
      kind: "polyline",
      pixels: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 50 },
      ],
    };
    expect(hitTest(shape, { x: 500, y: 500 })).toBeNull();
  });

  it("returns null when nothing hit", () => {
    const shape: ShapeGeom = { kind: "trendline", pixels: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
    expect(hitTest(shape, { x: 500, y: 500 })).toBeNull();
  });
});

describe("measureStats", () => {
  const bars = [0, 60, 120, 180, 240];

  it("computes known numbers", () => {
    const p1: AnnotationPoint = { time: 0, price: 100 };
    const p2: AnnotationPoint = { time: 120, price: 150 };
    const stats = measureStats(p1, p2, bars);
    expect(stats.dPrice).toBe(50);
    expect(stats.dPct).toBe(50);
    expect(stats.bars).toBe(2);
    expect(stats.dSeconds).toBe(120);
  });

  it("zero p1.price yields dPct 0", () => {
    const p1: AnnotationPoint = { time: 0, price: 0 };
    const p2: AnnotationPoint = { time: 60, price: 10 };
    const stats = measureStats(p1, p2, bars);
    expect(stats.dPct).toBe(0);
  });
});
