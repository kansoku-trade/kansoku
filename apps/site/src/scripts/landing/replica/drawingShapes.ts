export type DrawingTool =
  'off' | 'cursor' | 'measure' | 'trendline' | 'hline' | 'rect' | 'fib' | 'polyline';
export type AnnotationKind = Exclude<DrawingTool, 'off' | 'cursor' | 'measure'>;

export interface Point {
  time: number;
  price: number;
}

export interface Annotation {
  id: string;
  kind: AnnotationKind;
  points: Point[];
}

const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

const TWO_POINT_TOOLS: DrawingTool[] = ['measure', 'trendline', 'rect', 'fib'];

export const isTwoPointTool = (tool: DrawingTool): boolean => TWO_POINT_TOOLS.includes(tool);

export const MAX_POLYLINE_POINTS = 20;

export interface FibLevel {
  ratio: number;
  price: number;
}

export const fibLevels = (p1: Point, p2: Point): FibLevel[] =>
  FIB_RATIOS.map((ratio) => ({ ratio, price: p1.price + ratio * (p2.price - p1.price) }));

const medianGap = (barTimes: number[]): number => {
  if (barTimes.length < 2) return 60;
  const start = Math.max(0, barTimes.length - 21);
  const gaps: number[] = [];
  for (let i = start + 1; i < barTimes.length; i++) gaps.push(barTimes[i] - barTimes[i - 1]);
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  return gaps.length % 2 === 0 ? (gaps[mid - 1] + gaps[mid]) / 2 : gaps[mid];
};

export const timeToLogical = (barTimes: number[], time: number): number => {
  const n = barTimes.length;
  if (n === 0) return Number.NaN;
  if (time < barTimes[0]) return (time - barTimes[0]) / medianGap(barTimes);
  if (time > barTimes[n - 1]) return n - 1 + (time - barTimes[n - 1]) / medianGap(barTimes);
  for (let i = 0; i < n; i++) if (barTimes[i] === time) return i;
  for (let i = 0; i < n - 1; i++) {
    if (barTimes[i] < time && time < barTimes[i + 1]) {
      return i + (time - barTimes[i]) / (barTimes[i + 1] - barTimes[i]);
    }
  }
  return Number.NaN;
};

export interface MeasureStats {
  dPrice: number;
  dPct: number;
  bars: number;
}

export const measureStats = (p1: Point, p2: Point, barTimes: number[]): MeasureStats => ({
  dPrice: p2.price - p1.price,
  dPct: p1.price === 0 ? 0 : ((p2.price - p1.price) / p1.price) * 100,
  bars: Math.round(Math.abs(timeToLogical(barTimes, p2.time) - timeToLogical(barTimes, p1.time))),
});

export const measureLabel = (stats: MeasureStats): string =>
  `${stats.dPrice >= 0 ? '+' : ''}${stats.dPrice.toFixed(2)}  ${stats.dPct >= 0 ? '+' : ''}${stats.dPct.toFixed(2)}%  ${stats.bars} 根`;

// A tool that needs two points cannot commit on the first click; hline needs exactly one and
// polyline stays open until the user ends it.
export const shapeIsComplete = (kind: AnnotationKind, points: Point[]): boolean => {
  if (kind === 'hline') return points.length >= 1;
  if (kind === 'polyline') return points.length >= 2;
  return points.length >= 2;
};

export const clampPolyline = (points: Point[]): Point[] =>
  points.length > MAX_POLYLINE_POINTS ? points.slice(0, MAX_POLYLINE_POINTS) : points;
