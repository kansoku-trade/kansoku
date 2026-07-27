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

export type ReplayBandKind = 'given' | 'played' | 'epilogue';

export interface ReplayBand {
  kind: ReplayBandKind;
  startTime: number;
  endTime: number;
}

type DrawTarget = Parameters<IPrimitivePaneRenderer['draw']>[0];

export const REPLAY_BAND_FILL: Record<ReplayBandKind, string> = {
  given: 'rgba(232, 232, 232, 0.045)',
  played: 'rgba(38, 166, 154, 0.10)',
  epilogue: 'rgba(255, 176, 0, 0.10)',
};

interface BandPx {
  x: number;
  w: number;
  color: string;
}

class ReplayBandRenderer implements IPrimitivePaneRenderer {
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

function firstAtOrAfter(times: number[], t: number): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function lastAtOrBefore(times: number[], t: number): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

class ReplayBandPaneView implements IPrimitivePaneView {
  private bands: BandPx[] = [];

  constructor(private readonly source: ReplayBandPrimitive) {}

  update(): void {
    const { chart, series, bands } = this.source.state();
    this.bands = [];
    if (!chart || !series || bands.length === 0) return;
    const times = series.data().map((point) => Number(point.time));
    if (times.length === 0) return;
    const ts = chart.timeScale();
    const visible = ts.getVisibleRange();
    // paneSize(), not timeScale().width(): the latter reports 0 when the time axis is hidden, which
    // clamps every band to zero width on the settlement thumbnail.
    const width = chart.paneSize().width;
    const half = ts.options().barSpacing / 2;

    for (const band of bands) {
      const from = firstAtOrAfter(times, band.startTime);
      const to = lastAtOrBefore(times, band.endTime);
      if (from > to) continue;
      const startTime = times[from];
      const endTime = times[to];
      // timeToCoordinate returns null for a bar scrolled out of view; falling back to the pane edge
      // (as PositionBoxPrimitive does) keeps the visible remainder of a band painted instead of
      // dropping the whole band the moment either end leaves the window.
      const cxStart = ts.timeToCoordinate(startTime as Time);
      const cxEnd = ts.timeToCoordinate(endTime as Time);
      let x1: number;
      if (cxStart === null) {
        if (visible && startTime < Number(visible.from)) x1 = 0;
        else continue;
      } else {
        x1 = cxStart - half;
      }
      let x2: number;
      if (cxEnd === null) {
        if (visible && endTime > Number(visible.to)) x2 = width;
        else continue;
      } else {
        x2 = cxEnd + half;
      }
      x1 = Math.max(0, x1);
      x2 = Math.min(width, x2);
      if (x2 <= x1) continue;
      this.bands.push({ x: x1, w: x2 - x1, color: REPLAY_BAND_FILL[band.kind] });
    }
  }

  renderer(): IPrimitivePaneRenderer {
    return new ReplayBandRenderer(this.bands);
  }

  zOrder(): PrimitivePaneViewZOrder {
    return 'bottom';
  }
}

export class ReplayBandPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApiBase<Time> | null = null;
  private series: ISeriesApi<'Candlestick'> | null = null;
  private requestUpdate?: () => void;
  private bands: ReplayBand[] = [];
  private readonly paneView = new ReplayBandPaneView(this);

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

  setData(bands: ReplayBand[]): void {
    this.bands = bands;
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
    bands: ReplayBand[];
  } {
    return { chart: this.chart, series: this.series, bands: this.bands };
  }
}
