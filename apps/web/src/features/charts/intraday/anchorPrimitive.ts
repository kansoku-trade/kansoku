import type {
  IChartApiBase,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts';

type DrawTarget = Parameters<IPrimitivePaneRenderer['draw']>[0];

const ANCHOR_BG = 'rgba(88, 166, 255, 0.18)';

interface BandPx {
  x: number;
  w: number;
}

class AnchorRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly bands: BandPx[]) {}

  draw(target: DrawTarget): void {
    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context;
      const h = scope.mediaSize.height;
      ctx.save();
      ctx.fillStyle = ANCHOR_BG;
      for (const b of this.bands) {
        if (b.w <= 0) continue;
        ctx.fillRect(b.x, 0, b.w, h);
      }
      ctx.restore();
    });
  }
}

class AnchorPaneView implements IPrimitivePaneView {
  private bands: BandPx[] = [];

  constructor(private readonly source: AnchorBgPrimitive) {}

  update(): void {
    const { chart, times } = this.source.state();
    this.bands = [];
    if (!chart || times.length === 0) return;
    const ts = chart.timeScale();
    const half = ts.options().barSpacing / 2;
    for (const time of times) {
      const cx = ts.timeToCoordinate(time as Time);
      if (cx === null) continue;
      const x = Math.round(cx - half);
      const right = Math.round(cx + half);
      this.bands.push({ x, w: right - x });
    }
  }

  renderer(): IPrimitivePaneRenderer {
    return new AnchorRenderer(this.bands);
  }

  zOrder(): PrimitivePaneViewZOrder {
    return 'bottom';
  }
}

export class AnchorBgPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApiBase<Time> | null = null;
  private requestUpdate?: () => void;
  private times: number[] = [];
  private readonly paneView = new AnchorPaneView(this);

  attached(param: SeriesAttachedParameter<Time>): void {
    this.chart = param.chart;
    this.requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this.chart = null;
    this.requestUpdate = undefined;
  }

  setData(times: number[]): void {
    this.times = times;
    this.requestUpdate?.();
  }

  updateAllViews(): void {
    this.paneView.update();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView];
  }

  state(): { chart: IChartApiBase<Time> | null; times: number[] } {
    return { chart: this.chart, times: this.times };
  }
}
