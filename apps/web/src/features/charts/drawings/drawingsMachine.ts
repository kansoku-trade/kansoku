import type { Annotation, AnnotationKind, AnnotationPoint } from '@kansoku/shared/types';
import { hitTest, type HitRegion, type Pt } from '@kansoku/shared/drawings';

export type DrawingTool =
  'cursor' | 'measure' | 'trendline' | 'hline' | 'rect' | 'fib' | 'polyline';

export type TwoPointTool = 'measure' | 'trendline' | 'rect' | 'fib';

export type MultiPointTool = TwoPointTool | 'polyline';

export const TWO_POINT_TOOLS: TwoPointTool[] = ['measure', 'trendline', 'rect', 'fib'];

export const MAX_POLYLINE_POINTS = 20;

export function isTwoPointTool(tool: DrawingTool): tool is TwoPointTool {
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

export function translatePoints(
  points: AnnotationPoint[],
  dTime: number,
  dPrice: number,
): AnnotationPoint[] {
  return points.map((point) => ({ time: point.time + dTime, price: point.price + dPrice }));
}

export function movePoint(
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
