import type {
  IChartApiBase,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  Time,
} from "lightweight-charts";
import type { IntradayFvgZone } from "@kansoku/shared/types";
import { theme } from "@web/theme";

type DrawTarget = Parameters<IPrimitivePaneRenderer["draw"]>[0];

const FILL_ALPHA = 0.1;
const STROKE_ALPHA = 0.55;
const LABEL_MIN_HEIGHT = 14;

const hexToRgba = (hex: string, alpha: number): string => {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

interface RectPx {
  x1: number;
  x2: number;
  yTop: number;
  yBottom: number;
  fill: string;
  stroke: string;
  label: string;
}

class FvgRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly rects: RectPx[]) {}

  draw(target: DrawTarget): void {
    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context;
      ctx.save();
      for (const r of this.rects) {
        const w = r.x2 - r.x1;
        const h = r.yBottom - r.yTop;
        if (w <= 0 || h <= 0) continue;
        ctx.fillStyle = r.fill;
        ctx.fillRect(r.x1, r.yTop, w, h);
        ctx.strokeStyle = r.stroke;
        ctx.lineWidth = 1;
        ctx.strokeRect(r.x1 + 0.5, r.yTop + 0.5, w - 1, h - 1);
        if (h >= LABEL_MIN_HEIGHT) {
          ctx.fillStyle = r.stroke;
          ctx.font = "10px sans-serif";
          ctx.textBaseline = "middle";
          ctx.fillText(r.label, r.x1 + 4, (r.yTop + r.yBottom) / 2);
        }
      }
      ctx.restore();
    });
  }
}

class FvgPaneView implements IPrimitivePaneView {
  private rects: RectPx[] = [];

  constructor(private readonly source: FvgPrimitive) {}

  update(): void {
    const { chart, series, zones } = this.source.state();
    this.rects = [];
    if (!chart || !series || zones.length === 0) return;
    const ts = chart.timeScale();
    const visible = ts.getVisibleRange();
    const right = ts.width();
    for (const z of zones) {
      const yA = series.priceToCoordinate(z.high);
      const yB = series.priceToCoordinate(z.low);
      if (yA === null || yB === null) continue;
      const xCoord = ts.timeToCoordinate(z.startTime as Time);
      let x1: number;
      if (xCoord === null) {
        if (visible && z.startTime < (visible.from as number)) x1 = 0;
        else continue;
      } else {
        x1 = xCoord;
      }
      const base = z.kind === "bullish" ? theme.up : theme.down;
      this.rects.push({
        x1: Math.max(0, x1),
        x2: right,
        yTop: Math.min(yA, yB),
        yBottom: Math.max(yA, yB),
        fill: hexToRgba(base, FILL_ALPHA),
        stroke: hexToRgba(base, STROKE_ALPHA),
        label: `$${((z.high + z.low) / 2).toFixed(2)}`,
      });
    }
  }

  renderer(): IPrimitivePaneRenderer {
    return new FvgRenderer(this.rects);
  }

  zOrder(): PrimitivePaneViewZOrder {
    return "bottom";
  }
}

export class FvgPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApiBase<Time> | null = null;
  private series: ISeriesApi<"Candlestick"> | null = null;
  private requestUpdate?: () => void;
  private zones: IntradayFvgZone[] = [];
  private readonly paneView = new FvgPaneView(this);

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

  setData(zones: IntradayFvgZone[]): void {
    this.zones = zones;
    this.requestUpdate?.();
  }

  updateAllViews(): void {
    this.paneView.update();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView];
  }

  state(): { chart: IChartApiBase<Time> | null; series: ISeriesApi<"Candlestick"> | null; zones: IntradayFvgZone[] } {
    return { chart: this.chart, series: this.series, zones: this.zones };
  }
}
