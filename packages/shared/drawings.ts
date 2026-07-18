import type { AnnotationKind, AnnotationPoint } from './types.js';

export const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

export const ANNOTATION_PALETTE: readonly string[] = [
  '#3B82F6',
  '#EF4444',
  '#22C55E',
  '#F59E0B',
  '#A855F7',
  '#14B8A6',
  '#EC4899',
  '#64748B',
];

export interface FibLevel {
  ratio: number;
  price: number;
}

export function fibLevels(p1: AnnotationPoint, p2: AnnotationPoint): FibLevel[] {
  return FIB_RATIOS.map((ratio) => ({ ratio, price: p1.price + ratio * (p2.price - p1.price) }));
}

function medianGap(barTimes: number[]): number {
  if (barTimes.length < 2) return 60;
  const start = Math.max(0, barTimes.length - 21);
  const gaps: number[] = [];
  for (let i = start + 1; i < barTimes.length; i++) {
    gaps.push(barTimes[i] - barTimes[i - 1]);
  }
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  return gaps.length % 2 === 0 ? (gaps[mid - 1] + gaps[mid]) / 2 : gaps[mid];
}

export function timeToLogical(barTimes: number[], time: number): number {
  const n = barTimes.length;
  if (n === 0) return NaN;

  if (time < barTimes[0]) {
    return (time - barTimes[0]) / medianGap(barTimes);
  }
  if (time > barTimes[n - 1]) {
    return n - 1 + (time - barTimes[n - 1]) / medianGap(barTimes);
  }
  for (let i = 0; i < n; i++) {
    if (barTimes[i] === time) return i;
  }
  for (let i = 0; i < n - 1; i++) {
    if (barTimes[i] < time && time < barTimes[i + 1]) {
      return i + (time - barTimes[i]) / (barTimes[i + 1] - barTimes[i]);
    }
  }
  return NaN;
}

export function logicalToTime(barTimes: number[], logical: number): number {
  const n = barTimes.length;
  if (n === 0) return NaN;

  if (logical < 0) {
    return barTimes[0] + logical * medianGap(barTimes);
  }
  if (logical > n - 1) {
    return barTimes[n - 1] + (logical - (n - 1)) * medianGap(barTimes);
  }
  const i0 = Math.floor(logical);
  const i1 = Math.ceil(logical);
  if (i0 === i1) return barTimes[i0];
  return barTimes[i0] + (logical - i0) * (barTimes[i1] - barTimes[i0]);
}

export interface Pt {
  x: number;
  y: number;
}

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export type HitRegion = { type: 'point'; index: number } | { type: 'body' };

export interface ShapeGeom {
  kind: AnnotationKind;
  pixels: Pt[];
}

export function hitTest(
  shape: ShapeGeom,
  p: Pt,
  opts?: {
    tolerance?: number;
    handleRadius?: number;
    fibXRange?: [number, number];
    width?: number;
  },
): HitRegion | null {
  const tolerance = opts?.tolerance ?? 6;
  const handleRadius = opts?.handleRadius ?? 8;
  const { kind, pixels } = shape;

  for (let i = 0; i < pixels.length; i++) {
    if (Math.hypot(p.x - pixels[i].x, p.y - pixels[i].y) <= handleRadius) {
      return { type: 'point', index: i };
    }
  }

  if (kind === 'trendline') {
    if (pixels.length >= 2 && distToSegment(p, pixels[0], pixels[1]) <= tolerance)
      return { type: 'body' };
    return null;
  }

  if (kind === 'hline') {
    if (Math.abs(p.y - pixels[0].y) <= tolerance) return { type: 'body' };
    return null;
  }

  if (kind === 'rect') {
    const [a, b] = pixels;
    const corners: Pt[] = [
      { x: a.x, y: a.y },
      { x: b.x, y: a.y },
      { x: b.x, y: b.y },
      { x: a.x, y: b.y },
    ];
    for (let i = 0; i < corners.length; i++) {
      const c1 = corners[i];
      const c2 = corners[(i + 1) % corners.length];
      if (distToSegment(p, c1, c2) <= tolerance) return { type: 'body' };
    }
    return null;
  }

  if (kind === 'polyline') {
    for (let i = 0; i < pixels.length - 1; i++) {
      if (distToSegment(p, pixels[i], pixels[i + 1]) <= tolerance) return { type: 'body' };
    }
    return null;
  }

  if (kind === 'fib') {
    const [a, b] = pixels;
    const [xMin, xMax] = opts?.fibXRange ?? [Math.min(a.x, b.x), Math.max(a.x, b.x)];
    if (p.x < xMin || p.x > xMax) return null;
    for (const ratio of FIB_RATIOS) {
      const levelY = a.y + ratio * (b.y - a.y);
      if (Math.abs(p.y - levelY) <= tolerance) return { type: 'body' };
    }
    return null;
  }

  return null;
}

export interface MeasureStats {
  dPrice: number;
  dPct: number;
  bars: number;
  dSeconds: number;
}

export function measureStats(
  p1: AnnotationPoint,
  p2: AnnotationPoint,
  barTimes: number[],
): MeasureStats {
  const dPrice = p2.price - p1.price;
  const dPct = p1.price === 0 ? 0 : (dPrice / p1.price) * 100;
  const bars = Math.round(
    Math.abs(timeToLogical(barTimes, p2.time) - timeToLogical(barTimes, p1.time)),
  );
  const dSeconds = Math.abs(p2.time - p1.time);
  return { dPrice, dPct, bars, dSeconds };
}
