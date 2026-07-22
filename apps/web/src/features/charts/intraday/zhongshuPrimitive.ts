import type {
  IChartApiBase,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts';
import type { PriceRectangle } from '@kansoku/shared/types';

type DrawTarget = Parameters<IPrimitivePaneRenderer['draw']>[0];

const FILL = 'rgba(128, 128, 128, 0.15)';
const STROKE = 'rgba(128, 128, 128, 0.5)';
const LABEL_MIN_HEIGHT = 14;

interface RectPx {
  x1: number;
  x2: number;
  yTop: number;
  yBottom: number;
}

class ZhongshuRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly rects: RectPx[]) {}

  draw(target: DrawTarget): void {
    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context;
      ctx.save();
      ctx.fillStyle = FILL;
      ctx.strokeStyle = STROKE;
      ctx.lineWidth = 1;
      for (const r of this.rects) {
        const w = r.x2 - r.x1;
        const h = r.yBottom - r.yTop;
        if (w <= 0 || h <= 0) continue;
        ctx.fillStyle = FILL;
        ctx.fillRect(r.x1, r.yTop, w, h);
        ctx.strokeRect(r.x1 + 0.5, r.yTop + 0.5, w - 1, h - 1);
        if (h >= LABEL_MIN_HEIGHT) {
          ctx.font = '10px sans-serif';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = STROKE;
          ctx.fillText('中枢', r.x1 + 4, r.yTop + 9);
        }
      }
      ctx.restore();
    });
  }
}

class ZhongshuPaneView implements IPrimitivePaneView {
  private rects: RectPx[] = [];

  constructor(private readonly source: ZhongshuPrimitive) {}

  update(): void {
    const { chart, series, zones } = this.source.state();
    this.rects = [];
    if (!chart || !series || zones.length === 0) return;
    const ts = chart.timeScale();
    const visible = ts.getVisibleRange();
    const right = ts.width();
    for (const z of zones) {
      const yA = series.priceToCoordinate(z.priceHigh);
      const yB = series.priceToCoordinate(z.priceLow);
      if (yA === null || yB === null) continue;

      const xStart = ts.timeToCoordinate(z.startTime as Time);
      let x1: number;
      if (xStart === null) {
        if (visible && z.startTime < (visible.from as number)) x1 = 0;
        else continue;
      } else {
        x1 = xStart;
      }

      const xEnd = ts.timeToCoordinate(z.endTime as Time);
      let x2: number;
      if (xEnd === null) {
        if (visible && z.endTime > (visible.to as number)) x2 = right;
        else continue;
      } else {
        x2 = xEnd;
      }

      this.rects.push({
        x1: Math.max(0, x1),
        x2: Math.min(right, x2),
        yTop: Math.min(yA, yB),
        yBottom: Math.max(yA, yB),
      });
    }
  }

  renderer(): IPrimitivePaneRenderer {
    return new ZhongshuRenderer(this.rects);
  }

  zOrder(): PrimitivePaneViewZOrder {
    return 'bottom';
  }
}

export class ZhongshuPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApiBase<Time> | null = null;
  private series: ISeriesApi<'Candlestick'> | null = null;
  private requestUpdate?: () => void;
  private zones: PriceRectangle[] = [];
  private readonly paneView = new ZhongshuPaneView(this);

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

  setData(zones: PriceRectangle[]): void {
    this.zones = zones;
    this.requestUpdate?.();
  }

  updateAllViews(): void {
    this.paneView.update();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView];
  }

  state(): {
    chart: IChartApiBase<Time> | null;
    series: ISeriesApi<'Candlestick'> | null;
    zones: PriceRectangle[];
  } {
    return { chart: this.chart, series: this.series, zones: this.zones };
  }
}
