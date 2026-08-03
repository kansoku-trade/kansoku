import type { Annotation, AnnotationKind, AnnotationPoint } from '@kansoku/shared/types';
import { hitTest, type HitRegion, type Pt } from '@kansoku/shared/drawings';

// 'off' is painted but inert: every branch in useDrawingsInteraction must fall through it, so a
// second pointer consumer on the same canvas can own the gesture without the drawings layer being
// torn down and the shapes vanishing mid-analysis.
export type DrawingTool =
  'off' | 'cursor' | 'measure' | 'trendline' | 'hline' | 'rect' | 'fib' | 'polyline';

type TwoPointTool = 'measure' | 'trendline' | 'rect' | 'fib';

export type MultiPointTool = TwoPointTool | 'polyline';

export const MAX_POLYLINE_POINTS = 20;

function isTwoPointTool(tool: DrawingTool): tool is TwoPointTool {
  return tool === 'measure' || tool === 'trendline' || tool === 'rect' || tool === 'fib';
}

export function isMultiPointTool(tool: DrawingTool): tool is MultiPointTool {
  return isTwoPointTool(tool) || tool === 'polyline';
}

export function pixelDistance(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function pickHit(
  annotations: Annotation[],
  toPx: (point: AnnotationPoint) => Pt | null,
  p: Pt,
): { id: string; region: HitRegion } | null {
  for (let i = annotations.length - 1; i >= 0; i--) {
    const ann = annotations[i];
    const pixels: Pt[] = [];
    let complete = true;
    for (const point of ann.points) {
      const px = toPx(point);
      if (!px) {
        complete = false;
        break;
      }
      pixels.push(px);
    }
    if (!complete) continue;
    const region = hitTest({ kind: ann.kind, pixels }, p);
    if (region) return { id: ann.id, region };
  }
  return null;
}

function translatePoints(
  points: AnnotationPoint[],
  dTime: number,
  dPrice: number,
): AnnotationPoint[] {
  return points.map((point) => ({ time: point.time + dTime, price: point.price + dPrice }));
}

function movePoint(
  points: AnnotationPoint[],
  index: number,
  point: AnnotationPoint,
): AnnotationPoint[] {
  return points.map((existing, i) => (i === index ? point : existing));
}

export function dragPoints(
  origPoints: AnnotationPoint[],
  region: HitRegion,
  startTime: number,
  startPrice: number,
  point: AnnotationPoint,
): AnnotationPoint[] {
  if (region.type === 'point') return movePoint(origPoints, region.index, point);
  return translatePoints(origPoints, point.time - startTime, point.price - startPrice);
}

export function makeAnnotation(
  kind: AnnotationKind,
  points: AnnotationPoint[],
  id: string,
  createdAt: number,
): Annotation {
  return { id, kind, points, createdAt };
}
