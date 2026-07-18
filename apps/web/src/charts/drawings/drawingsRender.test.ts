import { describe, expect, it } from "vitest";
import { ANNOTATION_PALETTE } from "@kansoku/shared/drawings";
import type { Annotation } from "@kansoku/shared/types";
import { AI_DEFAULT_COLOR, buildFrame, resolveAnnotationStyle } from "./drawingsRender";
import type { DrawingsState } from "./drawingsPrimitive";

const BAR_TIMES = Array.from({ length: 10 }, (_, i) => i * 60);

function fakeChart(width = 800) {
  return {
    timeScale: () => ({
      width: () => width,
      logicalToCoordinate: (logical: number) => logical * 10,
    }),
  } as unknown as Parameters<typeof buildFrame>[1];
}

function fakeSeries() {
  return {
    priceToCoordinate: (price: number) => 1000 - price,
  } as unknown as Parameters<typeof buildFrame>[2];
}

function baseState(annotations: Annotation[], selectedId: string | null = null): DrawingsState {
  return { annotations, selectedId, preview: null, measure: null, hoverLabel: null, barTimes: BAR_TIMES };
}

describe("resolveAnnotationStyle", () => {
  it("falls back to the per-kind theme default when style is absent", () => {
    const trendline = resolveAnnotationStyle({ kind: "trendline", source: "user" });
    expect(trendline.width).toBe(2);
    expect(trendline.dash).toBe(false);

    const hline = resolveAnnotationStyle({ kind: "hline", source: "user" });
    expect(hline.width).toBe(1);
    expect(hline.dash).toBe(false);
  });

  it("renders ai-sourced annotations without an explicit style as purple dashed", () => {
    const style = resolveAnnotationStyle({ kind: "trendline", source: "ai" });
    expect(style.color).toBe(AI_DEFAULT_COLOR);
    expect(style.dash).toBe(true);
    expect(ANNOTATION_PALETTE).toContain(AI_DEFAULT_COLOR);
  });

  it("lets an explicit style override the ai default entirely", () => {
    const style = resolveAnnotationStyle({
      kind: "trendline",
      source: "ai",
      style: { color: ANNOTATION_PALETTE[0], width: 3, dash: false },
    });
    expect(style).toEqual({ color: ANNOTATION_PALETTE[0], width: 3, dash: false, arrow: false });
  });

  it("lets a user annotation opt into an explicit style", () => {
    const style = resolveAnnotationStyle({ kind: "rect", source: "user", style: { color: ANNOTATION_PALETTE[2] } });
    expect(style.color).toBe(ANNOTATION_PALETTE[2]);
    expect(style.width).toBe(1.5);
    expect(style.dash).toBe(false);
  });

  it("a partial style only overrides the fields it sets", () => {
    const style = resolveAnnotationStyle({ kind: "fib", source: "user", style: { dash: true } });
    expect(style.dash).toBe(true);
    expect(style.color).not.toBe(AI_DEFAULT_COLOR);
  });

  it("defaults arrow to false when style omits it", () => {
    expect(resolveAnnotationStyle({ kind: "trendline", source: "user" }).arrow).toBe(false);
  });

  it("picks up an explicit arrow flag", () => {
    expect(resolveAnnotationStyle({ kind: "polyline", source: "user", style: { arrow: true } }).arrow).toBe(true);
  });
});

describe("buildFrame polyline", () => {
  const points = [
    { time: 0, price: 10 },
    { time: 60, price: 20 },
    { time: 120, price: 5 },
    { time: 180, price: 30 },
  ];

  it("builds one segment per consecutive pair of points", () => {
    const ann: Annotation = { id: "p1", kind: "polyline", points, createdAt: 1 };
    const frame = buildFrame(baseState([ann]), fakeChart(), fakeSeries());
    const segments = frame.cmds.filter((c) => c.type === "segment");
    expect(segments).toHaveLength(points.length - 1);
  });

  it("emits no shape for fewer than two points", () => {
    const ann: Annotation = { id: "p1", kind: "polyline", points: [points[0]], createdAt: 1 };
    const frame = buildFrame(baseState([ann]), fakeChart(), fakeSeries());
    expect(frame.cmds).toHaveLength(0);
  });

  it("draws handles for every point when selected", () => {
    const ann: Annotation = { id: "p1", kind: "polyline", points, createdAt: 1 };
    const frame = buildFrame(baseState([ann], "p1"), fakeChart(), fakeSeries());
    const handles = frame.cmds.find((c) => c.type === "handles");
    expect(handles?.type).toBe("handles");
    if (handles?.type === "handles") expect(handles.points).toHaveLength(points.length);
  });

  it("adds no arrow command when style.arrow is unset", () => {
    const ann: Annotation = { id: "p1", kind: "polyline", points, createdAt: 1 };
    const frame = buildFrame(baseState([ann]), fakeChart(), fakeSeries());
    expect(frame.cmds.some((c) => c.type === "arrow")).toBe(false);
  });

  it("adds an arrow command oriented along the final segment when style.arrow is set", () => {
    const ann: Annotation = { id: "p1", kind: "polyline", points, style: { arrow: true }, createdAt: 1 };
    const frame = buildFrame(baseState([ann]), fakeChart(), fakeSeries());
    const arrow = frame.cmds.find((c) => c.type === "arrow");
    expect(arrow?.type).toBe("arrow");
    if (arrow?.type === "arrow") {
      const last = points[points.length - 1];
      const prev = points[points.length - 2];
      const dPrice = last.price - prev.price;
      expect(Math.sign(Math.sin(arrow.angle))).toBe(Math.sign(-dPrice));
    }
  });

  it("adds an arrow command for a trendline when style.arrow is set", () => {
    const ann: Annotation = { id: "t1", kind: "trendline", points: [points[0], points[1]], style: { arrow: true }, createdAt: 1 };
    const frame = buildFrame(baseState([ann]), fakeChart(), fakeSeries());
    expect(frame.cmds.filter((c) => c.type === "arrow")).toHaveLength(1);
  });
});
