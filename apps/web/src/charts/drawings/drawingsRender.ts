import type { IChartApiBase, ISeriesApi, Logical, Time } from "lightweight-charts";
import type { Annotation, AnnotationKind, AnnotationPoint } from "@kansoku/shared/types";
import { ANNOTATION_PALETTE, fibLevels, measureStats, timeToLogical } from "@kansoku/shared/drawings";
import { theme } from "@web/theme";
import type { DrawingsState, HoverLabel, MeasureShape } from "./drawingsPrimitive";

const KIND_COLORS: Record<AnnotationKind, string> = {
  trendline: theme.accent,
  hline: theme.up,
  rect: theme.down,
  fib: theme.textPrimary,
  polyline: theme.accent,
};

const KIND_WIDTHS: Record<AnnotationKind, number> = {
  trendline: 2,
  hline: 1,
  rect: 1.5,
  fib: 1,
  polyline: 2,
};

export const AI_DEFAULT_COLOR = ANNOTATION_PALETTE[4];

const ARROW_SIZE_FACTOR = 3;

export interface ResolvedStyle {
  color: string;
  width: number;
  dash: boolean;
  arrow: boolean;
}

export function resolveAnnotationStyle(ann: Pick<Annotation, "kind" | "source" | "style">): ResolvedStyle {
  const isAiDefault = ann.source === "ai" && !ann.style;
  return {
    color: ann.style?.color ?? (isAiDefault ? AI_DEFAULT_COLOR : KIND_COLORS[ann.kind]),
    width: ann.style?.width ?? KIND_WIDTHS[ann.kind],
    dash: ann.style?.dash ?? isAiDefault,
    arrow: ann.style?.arrow ?? false,
  };
}

const MEASURE_LABEL_W = 150;
const MEASURE_LABEL_H = 34;

const HOVER_LABEL_W = 220;
const HOVER_LABEL_CHARS_PER_LINE = 16;
const HOVER_LABEL_LINE_H = 14;
const HOVER_LABEL_PAD = 12;
const HOVER_LABEL_OFFSET = 14;

function wrapLabel(text: string): string[] {
  const lines: string[] = [];
  for (let i = 0; i < text.length; i += HOVER_LABEL_CHARS_PER_LINE) {
    lines.push(text.slice(i, i + HOVER_LABEL_CHARS_PER_LINE));
  }
  return lines.length > 0 ? lines : [""];
}

export type DrawCmd =
  | { type: "segment"; x1: number; y1: number; x2: number; y2: number; color: string; width: number; dashed: boolean }
  | { type: "hline"; y: number; x1: number; x2: number; color: string; width: number; dashed: boolean }
  | {
      type: "rect";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      stroke: string;
      fill: string;
      width: number;
      dashed: boolean;
    }
  | { type: "fib"; x1: number; x2: number; color: string; dashed: boolean; levels: FibLevelPx[] }
  | { type: "arrow"; x: number; y: number; angle: number; size: number; color: string }
  | { type: "handles"; color: string; points: Pt[] }
  | { type: "measureRect"; x1: number; y1: number; x2: number; y2: number; fill: string }
  | { type: "measureLabel"; x: number; y: number; w: number; h: number; lines: string[] }
  | { type: "label"; x: number; y: number; w: number; h: number; lines: string[] };

interface Pt {
  x: number;
  y: number;
}

interface FibLevelPx {
  y: number;
  label: string;
  heavy: boolean;
}

export interface AxisLabel {
  y: number;
  text: string;
  color: string;
}

export interface DrawFrame {
  cmds: DrawCmd[];
  axisLabels: AxisLabel[];
}

const EMPTY_SHAPE = { cmds: [] as DrawCmd[], axisLabels: [] as AxisLabel[] };

function hexToRgba(hex: string, alpha: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function formatPrice(price: number): string {
  return price.toFixed(2);
}

function humanizeDuration(seconds: number): string {
  const abs = Math.abs(seconds);
  if (abs < 3600) return `${Math.round(abs / 60)}m`;
  if (abs < 86400) return `${(abs / 3600).toFixed(1)}h`;
  return `${(abs / 86400).toFixed(1)}d`;
}

function buildArrowCmd(from: Pt, to: Pt, color: string, width: number): DrawCmd {
  return { type: "arrow", x: to.x, y: to.y, angle: Math.atan2(to.y - from.y, to.x - from.x), size: width * ARROW_SIZE_FACTOR, color };
}

function toPixel(
  chart: IChartApiBase<Time>,
  series: ISeriesApi<"Candlestick">,
  barTimes: number[],
  point: AnnotationPoint,
): Pt | null {
  const logical = timeToLogical(barTimes, point.time);
  if (!Number.isFinite(logical)) return null;
  const x = chart.timeScale().logicalToCoordinate(logical as Logical);
  const y = series.priceToCoordinate(point.price);
  if (x === null || y === null) return null;
  return { x, y };
}

function buildShape(
  kind: AnnotationKind,
  points: AnnotationPoint[],
  chart: IChartApiBase<Time>,
  series: ISeriesApi<"Candlestick">,
  barTimes: number[],
  paneWidth: number,
  style: ResolvedStyle,
): { cmds: DrawCmd[]; axisLabels: AxisLabel[] } {
  const { color, width, dash: dashed } = style;

  if (kind === "trendline") {
    if (points.length < 2) return EMPTY_SHAPE;
    const a = toPixel(chart, series, barTimes, points[0]);
    const b = toPixel(chart, series, barTimes, points[1]);
    if (!a || !b) return EMPTY_SHAPE;
    const cmds: DrawCmd[] = [{ type: "segment", x1: a.x, y1: a.y, x2: b.x, y2: b.y, color, width, dashed }];
    if (style.arrow) cmds.push(buildArrowCmd(a, b, color, width));
    return { cmds, axisLabels: [] };
  }

  if (kind === "polyline") {
    if (points.length < 2) return EMPTY_SHAPE;
    const pixels: Pt[] = [];
    for (const point of points) {
      const px = toPixel(chart, series, barTimes, point);
      if (!px) return EMPTY_SHAPE;
      pixels.push(px);
    }
    const cmds: DrawCmd[] = [];
    for (let i = 0; i < pixels.length - 1; i++) {
      const a = pixels[i];
      const b = pixels[i + 1];
      cmds.push({ type: "segment", x1: a.x, y1: a.y, x2: b.x, y2: b.y, color, width, dashed });
    }
    if (style.arrow) cmds.push(buildArrowCmd(pixels[pixels.length - 2], pixels[pixels.length - 1], color, width));
    return { cmds, axisLabels: [] };
  }

  if (kind === "hline") {
    if (points.length < 1) return EMPTY_SHAPE;
    const a = toPixel(chart, series, barTimes, points[0]);
    if (!a) return EMPTY_SHAPE;
    return {
      cmds: [{ type: "hline", y: a.y, x1: 0, x2: paneWidth, color, width, dashed }],
      axisLabels: [{ y: a.y, text: formatPrice(points[0].price), color }],
    };
  }

  if (kind === "rect") {
    if (points.length < 2) return EMPTY_SHAPE;
    const a = toPixel(chart, series, barTimes, points[0]);
    const b = toPixel(chart, series, barTimes, points[1]);
    if (!a || !b) return EMPTY_SHAPE;
    return {
      cmds: [
        {
          type: "rect",
          x1: Math.min(a.x, b.x),
          y1: Math.min(a.y, b.y),
          x2: Math.max(a.x, b.x),
          y2: Math.max(a.y, b.y),
          stroke: color,
          fill: hexToRgba(color, 0.08),
          width,
          dashed,
        },
      ],
      axisLabels: [],
    };
  }

  if (kind === "fib") {
    if (points.length < 2) return EMPTY_SHAPE;
    const a = toPixel(chart, series, barTimes, points[0]);
    const b = toPixel(chart, series, barTimes, points[1]);
    if (!a || !b) return EMPTY_SHAPE;
    const levelPx: FibLevelPx[] = [];
    for (const lvl of fibLevels(points[0], points[1])) {
      const y = series.priceToCoordinate(lvl.price);
      if (y === null) continue;
      levelPx.push({ y, label: `${lvl.ratio} (${formatPrice(lvl.price)})`, heavy: lvl.ratio === 0 || lvl.ratio === 1 });
    }
    return {
      cmds: [{ type: "fib", x1: Math.min(a.x, b.x), x2: Math.max(a.x, b.x), color, dashed, levels: levelPx }],
      axisLabels: [],
    };
  }

  return EMPTY_SHAPE;
}

function buildHandles(
  points: AnnotationPoint[],
  color: string,
  chart: IChartApiBase<Time>,
  series: ISeriesApi<"Candlestick">,
  barTimes: number[],
): DrawCmd | null {
  const pixels: Pt[] = [];
  for (const p of points) {
    const px = toPixel(chart, series, barTimes, p);
    if (px) pixels.push(px);
  }
  if (pixels.length === 0) return null;
  return { type: "handles", color, points: pixels };
}

function buildMeasure(
  measure: MeasureShape,
  chart: IChartApiBase<Time>,
  series: ISeriesApi<"Candlestick">,
  barTimes: number[],
): DrawCmd[] {
  const a = toPixel(chart, series, barTimes, measure.p1);
  const b = toPixel(chart, series, barTimes, measure.p2);
  if (!a || !b) return [];

  const bullish = measure.p2.price >= measure.p1.price;
  const rect: DrawCmd = {
    type: "measureRect",
    x1: Math.min(a.x, b.x),
    y1: Math.min(a.y, b.y),
    x2: Math.max(a.x, b.x),
    y2: Math.max(a.y, b.y),
    fill: hexToRgba(bullish ? theme.up : theme.down, 0.1),
  };

  const stats = measureStats(measure.p1, measure.p2, barTimes);
  const sign = stats.dPrice >= 0 ? "+" : "-";
  const line1 = `Δ ${sign}${Math.abs(stats.dPrice).toFixed(2)} (${sign}${Math.abs(stats.dPct).toFixed(2)}%)`;
  const line2 = `${stats.bars} bars · ${humanizeDuration(stats.dSeconds)}`;

  const anchorRight = b.x >= a.x;
  const anchorBelow = b.y >= a.y;
  const label: DrawCmd = {
    type: "measureLabel",
    x: anchorRight ? b.x + 10 : b.x - 10 - MEASURE_LABEL_W,
    y: anchorBelow ? b.y + 10 : b.y - 10 - MEASURE_LABEL_H,
    w: MEASURE_LABEL_W,
    h: MEASURE_LABEL_H,
    lines: [line1, line2],
  };

  return [rect, label];
}

export function buildFrame(state: DrawingsState, chart: IChartApiBase<Time>, series: ISeriesApi<"Candlestick">): DrawFrame {
  const { barTimes } = state;
  const paneWidth = chart.timeScale().width();
  const cmds: DrawCmd[] = [];
  const axisLabels: AxisLabel[] = [];

  for (const ann of state.annotations) {
    const style = resolveAnnotationStyle(ann);
    const built = buildShape(ann.kind, ann.points, chart, series, barTimes, paneWidth, style);
    cmds.push(...built.cmds);
    axisLabels.push(...built.axisLabels);
    if (ann.id === state.selectedId) {
      const handles = buildHandles(ann.points, style.color, chart, series, barTimes);
      if (handles) cmds.push(handles);
    }
  }

  if (state.preview) {
    const previewStyle: ResolvedStyle = {
      color: KIND_COLORS[state.preview.kind],
      width: KIND_WIDTHS[state.preview.kind],
      dash: true,
      arrow: false,
    };
    const built = buildShape(state.preview.kind, state.preview.points, chart, series, barTimes, paneWidth, previewStyle);
    cmds.push(...built.cmds);
    axisLabels.push(...built.axisLabels);
  }

  if (state.measure) {
    cmds.push(...buildMeasure(state.measure, chart, series, barTimes));
  }

  if (state.hoverLabel) {
    cmds.push(buildHoverLabel(state.hoverLabel));
  }

  return { cmds, axisLabels };
}

function buildHoverLabel(hover: HoverLabel): DrawCmd {
  const lines = wrapLabel(hover.text);
  const h = lines.length * HOVER_LABEL_LINE_H + HOVER_LABEL_PAD;
  return {
    type: "label",
    x: hover.x + HOVER_LABEL_OFFSET,
    y: hover.y + HOVER_LABEL_OFFSET,
    w: HOVER_LABEL_W,
    h,
    lines,
  };
}
