import type {
  IChartApiBase,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  Time,
} from "lightweight-charts";
import type { OffSessionSegment } from "@kansoku/shared/types";

type DrawTarget = Parameters<IPrimitivePaneRenderer["draw"]>[0];

const colorFor = (kind: OffSessionSegment["kind"]): string =>
  kind === "overnight" ? "rgba(70, 100, 180, 0.22)" : "rgba(232, 232, 232, 0.08)";

interface BandPx {
  x: number;
  w: number;
  color: string;
}

class SessionRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly bands: BandPx[]) {}

  draw(target: DrawTarget): void {
    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context;
      const h = scope.mediaSize.height;
      ctx.save();
      for (const b of this.bands) {
        if (b.w <= 0) continue;
        ctx.fillStyle = b.color;
        ctx.fillRect(b.x, 0, b.w, h);
      }
      ctx.restore();
    });
  }
}

class SessionPaneView implements IPrimitivePaneView {
  private bands: BandPx[] = [];

  constructor(private readonly source: SessionBgPrimitive) {}

  update(): void {
    const { chart, segments } = this.source.state();
    this.bands = [];
    if (!chart || segments.length === 0) return;
    const ts = chart.timeScale();
    const half = ts.options().barSpacing / 2;
    for (const seg of segments) {
      const cxStart = ts.timeToCoordinate(seg.startTime as Time);
      const cxEnd = ts.timeToCoordinate(seg.endTime as Time);
      if (cxStart === null || cxEnd === null) continue;
      const x = Math.round(cxStart - half);
      const right = Math.round(cxEnd + half);
      this.bands.push({ x, w: right - x, color: colorFor(seg.kind) });
    }
  }

  renderer(): IPrimitivePaneRenderer {
    return new SessionRenderer(this.bands);
  }

  zOrder(): PrimitivePaneViewZOrder {
    return "bottom";
  }
}

export class SessionBgPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApiBase<Time> | null = null;
  private requestUpdate?: () => void;
  private segments: OffSessionSegment[] = [];
  private readonly paneView = new SessionPaneView(this);

  attached(param: SeriesAttachedParameter<Time>): void {
    this.chart = param.chart;
    this.requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this.chart = null;
    this.requestUpdate = undefined;
  }

  setData(segments: OffSessionSegment[]): void {
    this.segments = segments;
    this.requestUpdate?.();
  }

  updateAllViews(): void {
    this.paneView.update();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView];
  }

  state(): { chart: IChartApiBase<Time> | null; segments: OffSessionSegment[] } {
    return { chart: this.chart, segments: this.segments };
  }
}
