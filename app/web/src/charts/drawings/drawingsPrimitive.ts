import type {
  IChartApiBase,
  ISeriesApi,
  ISeriesPrimitive,
  ISeriesPrimitiveAxisView,
  ISeriesPrimitivePaneRenderer,
  ISeriesPrimitivePaneView,
  SeriesAttachedParameter,
  SeriesPrimitivePaneViewZOrder,
  Time,
} from "lightweight-charts";
import type { Annotation, AnnotationPoint } from "../../../../shared/types";
import { paintFrame } from "./drawingsPaint";
import { buildFrame, type AxisLabel, type DrawFrame } from "./drawingsRender";

export interface PreviewShape {
  kind: Annotation["kind"];
  points: AnnotationPoint[];
}

export interface MeasureShape {
  p1: AnnotationPoint;
  p2: AnnotationPoint;
}

export interface DrawingsState {
  annotations: Annotation[];
  selectedId: string | null;
  preview: PreviewShape | null;
  measure: MeasureShape | null;
  barTimes: number[];
}

const EMPTY_STATE: DrawingsState = { annotations: [], selectedId: null, preview: null, measure: null, barTimes: [] };
const EMPTY_FRAME: DrawFrame = { cmds: [], axisLabels: [] };

type DrawTarget = Parameters<ISeriesPrimitivePaneRenderer["draw"]>[0];

class DrawingsRenderer implements ISeriesPrimitivePaneRenderer {
  constructor(private readonly frame: DrawFrame) {}

  draw(target: DrawTarget): void {
    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context;
      ctx.save();
      paintFrame(ctx, this.frame);
      ctx.restore();
    });
  }
}

class DrawingsPaneView implements ISeriesPrimitivePaneView {
  private frame: DrawFrame = EMPTY_FRAME;

  constructor(private readonly source: DrawingsPrimitive) {}

  update(): void {
    const { chart, series, state } = this.source.state();
    if (!chart || !series) {
      this.frame = EMPTY_FRAME;
      return;
    }
    this.frame = buildFrame(state, chart, series);
  }

  renderer(): ISeriesPrimitivePaneRenderer {
    return new DrawingsRenderer(this.frame);
  }

  zOrder(): SeriesPrimitivePaneViewZOrder {
    return "top";
  }

  axisLabels(): AxisLabel[] {
    return this.frame.axisLabels;
  }
}

class HlineAxisView implements ISeriesPrimitiveAxisView {
  constructor(private readonly label: AxisLabel) {}

  coordinate(): number {
    return this.label.y;
  }

  text(): string {
    return this.label.text;
  }

  textColor(): string {
    return "#0a0a0a";
  }

  backColor(): string {
    return this.label.color;
  }
}

export class DrawingsPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApiBase<Time> | null = null;
  private series: ISeriesApi<"Candlestick"> | null = null;
  private requestUpdate?: () => void;
  private drawingsState: DrawingsState = EMPTY_STATE;
  private readonly paneView = new DrawingsPaneView(this);

  attached(param: SeriesAttachedParameter<Time>): void {
    this.chart = param.chart;
    this.series = param.series as ISeriesApi<"Candlestick">;
    this.requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this.chart = null;
    this.series = null;
    this.requestUpdate = undefined;
  }

  setState(state: DrawingsState): void {
    this.drawingsState = state;
    this.requestUpdate?.();
  }

  updateAllViews(): void {
    this.paneView.update();
  }

  paneViews(): readonly ISeriesPrimitivePaneView[] {
    return [this.paneView];
  }

  priceAxisViews(): readonly ISeriesPrimitiveAxisView[] {
    return this.paneView.axisLabels().map((label) => new HlineAxisView(label));
  }

  state(): { chart: IChartApiBase<Time> | null; series: ISeriesApi<"Candlestick"> | null; state: DrawingsState } {
    return { chart: this.chart, series: this.series, state: this.drawingsState };
  }
}
