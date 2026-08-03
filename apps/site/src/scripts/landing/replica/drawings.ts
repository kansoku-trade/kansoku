import type {
  IChartApi,
  IChartApiBase,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  Logical,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts';
import {
  fibLevels,
  measureLabel,
  measureStats,
  timeToLogical,
  type Annotation,
  type AnnotationKind,
  type DrawingTool,
  type Point,
} from './drawingShapes';
import { DEMO_HANDLE_SCALE, DEMO_HANDLE_SCROLL } from './lw';
import {
  begin,
  cancel,
  clear,
  emptySession,
  end,
  finishPolyline,
  measureShape,
  move,
  previewShape,
  setTool,
} from './drawingSession';
import { theme } from './theme';

const KIND_COLOR: Record<AnnotationKind, string> = {
  trendline: theme.accent,
  hline: theme.up,
  rect: theme.down,
  fib: '#e8e8e8',
  polyline: theme.accent,
};

const KIND_WIDTH: Record<AnnotationKind, number> = {
  trendline: 2,
  hline: 1,
  rect: 1.5,
  fib: 1,
  polyline: 2,
};

interface Pixel {
  x: number;
  y: number;
}

interface FibRung {
  y: number;
  label: string;
}

interface Frame {
  shapes: Array<{
    kind: AnnotationKind;
    pixels: Pixel[];
    ghost: boolean;
    rungs?: FibRung[];
  }>;
  measure: { pixels: Pixel[]; label: string } | null;
  width: number;
}

const EMPTY_FRAME: Frame = { shapes: [], measure: null, width: 0 };

interface DrawingsState {
  annotations: Annotation[];
  preview: { kind: AnnotationKind; points: Point[] } | null;
  measure: { p1: Point; p2: Point } | null;
  barTimes: number[];
}

const EMPTY_STATE: DrawingsState = {
  annotations: [],
  preview: null,
  measure: null,
  barTimes: [],
};

const strokePath = (
  ctx: CanvasRenderingContext2D,
  pixels: Pixel[],
  color: string,
  width: number,
  ghost: boolean,
): void => {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(ghost ? [4, 4] : []);
  ctx.beginPath();
  pixels.forEach((pixel, i) => {
    if (i === 0) ctx.moveTo(pixel.x, pixel.y);
    else ctx.lineTo(pixel.x, pixel.y);
  });
  ctx.stroke();
  ctx.setLineDash([]);
};

const paintFib = (
  ctx: CanvasRenderingContext2D,
  pixels: Pixel[],
  rungs: FibRung[],
  ghost: boolean,
): void => {
  const [a, b] = pixels;
  const left = Math.min(a.x, b.x);
  const right = Math.max(a.x, b.x);
  ctx.font = '10px ui-monospace, Menlo, monospace';
  ctx.textBaseline = 'bottom';
  for (const rung of rungs) {
    strokePath(
      ctx,
      [
        { x: left, y: rung.y },
        { x: right, y: rung.y },
      ],
      KIND_COLOR.fib,
      1,
      ghost,
    );
    ctx.fillStyle = 'rgba(232, 232, 232, 0.7)';
    ctx.fillText(rung.label, left + 4, rung.y - 2);
  }
  strokePath(ctx, pixels, KIND_COLOR.fib, 1, true);
};

const paintShape = (
  ctx: CanvasRenderingContext2D,
  kind: AnnotationKind,
  pixels: Pixel[],
  ghost: boolean,
  width: number,
  rungs?: FibRung[],
): void => {
  const color = KIND_COLOR[kind];
  const lineWidth = KIND_WIDTH[kind];

  if (kind === 'fib' && rungs && rungs.length > 0) {
    paintFib(ctx, pixels, rungs, ghost);
    return;
  }
  if (kind === 'hline') {
    strokePath(
      ctx,
      [
        { x: 0, y: pixels[0].y },
        { x: width, y: pixels[0].y },
      ],
      color,
      lineWidth,
      ghost,
    );
    return;
  }
  if (kind === 'rect') {
    const [a, b] = pixels;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(ghost ? [4, 4] : []);
    ctx.strokeRect(
      Math.min(a.x, b.x),
      Math.min(a.y, b.y),
      Math.abs(b.x - a.x),
      Math.abs(b.y - a.y),
    );
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(239, 83, 80, 0.07)';
    ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    return;
  }
  strokePath(ctx, pixels, color, lineWidth, ghost);
};

class DrawingsRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly frame: Frame) {}

  draw(target: Parameters<IPrimitivePaneRenderer['draw']>[0]): void {
    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context;
      ctx.save();
      for (const shape of this.frame.shapes) {
        paintShape(ctx, shape.kind, shape.pixels, shape.ghost, this.frame.width, shape.rungs);
      }
      const measure = this.frame.measure;
      if (measure) {
        const [a, b] = measure.pixels;
        ctx.fillStyle = b.y <= a.y ? 'rgba(38, 166, 154, 0.14)' : 'rgba(239, 83, 80, 0.14)';
        ctx.fillRect(
          Math.min(a.x, b.x),
          Math.min(a.y, b.y),
          Math.abs(b.x - a.x),
          Math.abs(b.y - a.y),
        );
        strokePath(ctx, measure.pixels, theme.accent, 1, true);
        ctx.font = '11px ui-monospace, Menlo, monospace';
        const textWidth = ctx.measureText(measure.label).width + 14;
        const left = Math.min(b.x, this.frame.width - textWidth);
        ctx.fillStyle = 'rgba(12, 13, 16, 0.94)';
        ctx.fillRect(left, b.y - 24, textWidth, 18);
        ctx.strokeStyle = theme.accent;
        ctx.lineWidth = 1;
        ctx.strokeRect(left + 0.5, b.y - 23.5, textWidth - 1, 17);
        ctx.fillStyle = theme.accent;
        ctx.textBaseline = 'middle';
        ctx.fillText(measure.label, left + 7, b.y - 15);
      }
      ctx.restore();
    });
  }
}

class DrawingsPaneView implements IPrimitivePaneView {
  private frame: Frame = EMPTY_FRAME;

  constructor(private readonly source: DrawingsPrimitive) {}

  update(): void {
    const { chart, series, state } = this.source.read();
    if (!chart || !series) {
      this.frame = EMPTY_FRAME;
      return;
    }
    const width = chart.timeScale().width();
    const toPixel = (point: Point): Pixel | null => {
      const logical = timeToLogical(state.barTimes, point.time);
      if (Number.isNaN(logical)) return null;
      const x = chart.timeScale().logicalToCoordinate(logical as Logical);
      const y = series.priceToCoordinate(point.price);
      return x === null || y === null ? null : { x, y };
    };
    const project = (points: Point[]): Pixel[] | null => {
      const pixels: Pixel[] = [];
      for (const point of points) {
        const pixel = toPixel(point);
        if (!pixel) return null;
        pixels.push(pixel);
      }
      return pixels;
    };

    const rungsFor = (kind: AnnotationKind, points: Point[]): FibRung[] | undefined => {
      if (kind !== 'fib' || points.length < 2) return undefined;
      const rungs: FibRung[] = [];
      for (const level of fibLevels(points[0], points[1])) {
        const y = series.priceToCoordinate(level.price);
        if (y === null) continue;
        rungs.push({ y, label: `${level.ratio.toFixed(3)}  ${level.price.toFixed(2)}` });
      }
      return rungs;
    };

    const shapes: Frame['shapes'] = [];
    for (const annotation of state.annotations) {
      const pixels = project(annotation.points);
      if (!pixels) continue;
      shapes.push({
        kind: annotation.kind,
        pixels,
        ghost: false,
        rungs: rungsFor(annotation.kind, annotation.points),
      });
    }
    if (state.preview && state.preview.points.length >= 1) {
      const pixels = project(state.preview.points);
      if (pixels && (state.preview.kind === 'hline' || pixels.length >= 2)) {
        shapes.push({
          kind: state.preview.kind,
          pixels,
          ghost: true,
          rungs: rungsFor(state.preview.kind, state.preview.points),
        });
      }
    }

    let measure: Frame['measure'] = null;
    if (state.measure) {
      const pixels = project([state.measure.p1, state.measure.p2]);
      if (pixels) {
        measure = {
          pixels,
          label: measureLabel(measureStats(state.measure.p1, state.measure.p2, state.barTimes)),
        };
      }
    }

    this.frame = { shapes, measure, width };
  }

  renderer(): IPrimitivePaneRenderer {
    return new DrawingsRenderer(this.frame);
  }

  zOrder(): PrimitivePaneViewZOrder {
    return 'top';
  }
}

class DrawingsPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApiBase<Time> | null = null;
  private series: ISeriesApi<'Candlestick'> | null = null;
  private requestUpdate?: () => void;
  private state: DrawingsState = EMPTY_STATE;
  private readonly paneView = new DrawingsPaneView(this);

  attached(param: SeriesAttachedParameter<Time>): void {
    this.chart = param.chart;
    this.series = param.series as ISeriesApi<'Candlestick'>;
    this.requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this.chart = null;
    this.series = null;
    this.requestUpdate = undefined;
  }

  setState(state: DrawingsState): void {
    this.state = state;
    this.requestUpdate?.();
  }

  updateAllViews(): void {
    this.paneView.update();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView];
  }

  read(): {
    chart: IChartApiBase<Time> | null;
    series: ISeriesApi<'Candlestick'> | null;
    state: DrawingsState;
  } {
    return { chart: this.chart, series: this.series, state: this.state };
  }
}

export interface DrawingsApi {
  setTool: (tool: DrawingTool) => void;
  tool: () => DrawingTool;
  clear: () => void;
  setBarTimes: (barTimes: number[]) => void;
  destroy: () => void;
}

export interface MountDrawingsParams {
  chart: IChartApi;
  series: ISeriesApi<'Candlestick'>;
  container: HTMLElement;
  barTimes: number[];
  onToolChange?: (tool: DrawingTool) => void;
}

export const mountDrawings = ({
  chart,
  series,
  container,
  barTimes,
  onToolChange,
}: MountDrawingsParams): DrawingsApi => {
  const primitive = new DrawingsPrimitive();
  series.attachPrimitive(primitive);

  let session = emptySession();
  let times = barTimes;

  const push = (): void => {
    primitive.setState({
      annotations: session.annotations,
      preview: previewShape(session),
      measure: measureShape(session),
      barTimes: times,
    });
  };

  const locate = (event: PointerEvent): Point | null => {
    const rect = container.getBoundingClientRect();
    const logical = chart.timeScale().coordinateToLogical(event.clientX - rect.left);
    const price = series.coordinateToPrice(event.clientY - rect.top);
    if (logical === null || price === null) return null;
    const index = Math.round(logical);
    const time =
      index >= 0 && index < times.length
        ? times[index]
        : times.length > 0
          ? times.at(-1)! + (index - (times.length - 1)) * 60
          : 0;
    return { time, price };
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (session.tool === 'off' || session.tool === 'cursor') return;
    const point = locate(event);
    if (!point) return;
    event.preventDefault();
    container.setPointerCapture(event.pointerId);
    session = begin(session, point);
    push();
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (session.pending.length === 0) return;
    const point = locate(event);
    if (!point) return;
    session = move(session, point);
    push();
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (!session.dragging) return;
    if (container.hasPointerCapture(event.pointerId)) {
      container.releasePointerCapture(event.pointerId);
    }
    session = end(session, locate(event));
    push();
  };

  const onDoubleClick = (): void => {
    session = finishPolyline(session);
    push();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    session = cancel(session);
    push();
  };

  container.addEventListener('pointerdown', onPointerDown);
  container.addEventListener('pointermove', onPointerMove);
  container.addEventListener('pointerup', onPointerUp);
  container.addEventListener('dblclick', onDoubleClick);
  window.addEventListener('keydown', onKeyDown);
  push();

  return {
    setTool: (next: DrawingTool) => {
      session = setTool(session, next);
      const locked = next !== 'cursor' && next !== 'off';
      // Restore demo defaults (wheel still off) rather than boolean true, which re-enables
      // mouseWheel and steals the page scroll again.
      chart.applyOptions(
        locked
          ? { handleScroll: false, handleScale: false }
          : { handleScroll: { ...DEMO_HANDLE_SCROLL }, handleScale: { ...DEMO_HANDLE_SCALE } },
      );
      container.style.cursor = locked ? 'crosshair' : 'default';
      onToolChange?.(next);
      push();
    },
    tool: () => session.tool,
    clear: () => {
      session = clear(session);
      push();
    },
    setBarTimes: (next: number[]) => {
      times = next;
      push();
    },
    destroy: () => {
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('dblclick', onDoubleClick);
      window.removeEventListener('keydown', onKeyDown);
      series.detachPrimitive(primitive);
    },
  };
};
