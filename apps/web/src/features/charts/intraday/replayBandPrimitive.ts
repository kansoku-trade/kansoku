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

// `fog` is the stretch the trader never reached — they closed out or were flattened before it.
// It is drawn on the review chart only, where the whole case is on screen at once.
export type ReplayBandKind = 'given' | 'played' | 'fog' | 'epilogue';

export interface ReplayBand {
  kind: ReplayBandKind;
  startTime: number;
  endTime: number;
}

// `time` names a bar on the case's base period, which is a data point only on the base tier — the
// aggregated tiers bucket it away, and timeToCoordinate returns null for a time the series does not
// hold. So it is snapped to the bar that contains it, then drawn off whichever edge the caller
// says the boundary sits on.
export interface ReplayDivider {
  time: number;
  edge: 'before' | 'after';
  label: string;
}

const DIVIDER_COLOR = 'rgba(255, 176, 0, 0.55)';
const DIVIDER_LABEL_COLOR = 'rgba(255, 176, 0, 0.9)';

type DrawTarget = Parameters<IPrimitivePaneRenderer['draw']>[0];

export const REPLAY_BAND_FILL: Record<ReplayBandKind, string> = {
  given: 'rgba(232, 232, 232, 0.045)',
  played: 'rgba(38, 166, 154, 0.10)',
  fog: 'rgba(232, 232, 232, 0.10)',
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

interface DividerPx {
  x: number;
  label: string;
}

class ReplayDividerRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly dividers: DividerPx[]) {}

  draw(target: DrawTarget): void {
    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context;
      const h = scope.mediaSize.height;
      ctx.save();
      for (const divider of this.dividers) {
        ctx.strokeStyle = DIVIDER_COLOR;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(divider.x + 0.5, 0);
        ctx.lineTo(divider.x + 0.5, h);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = DIVIDER_LABEL_COLOR;
        ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textBaseline = 'top';
        // Left of the line when it would otherwise run off the right edge, which is where it sits
        // for the whole first half of an episode.
        const width = ctx.measureText(divider.label).width;
        const room = scope.mediaSize.width - divider.x - 6;
        ctx.textAlign = room < width ? 'right' : 'left';
        ctx.fillText(divider.label, divider.x + (room < width ? -6 : 6), 4);
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

class ReplayDividerPaneView implements IPrimitivePaneView {
  private dividers: DividerPx[] = [];

  constructor(private readonly source: ReplayBandPrimitive) {}

  update(): void {
    const { chart, series, dividers } = this.source.state();
    this.dividers = [];
    if (!chart || !series || dividers.length === 0) return;
    const times = series.data().map((point) => Number(point.time));
    if (times.length === 0) return;
    const ts = chart.timeScale();
    const width = chart.paneSize().width;
    const half = ts.options().barSpacing / 2;
    for (const divider of dividers) {
      const at = lastAtOrBefore(times, divider.time);
      if (at < 0) continue;
      const cx = ts.timeToCoordinate(times[at] as Time);
      if (cx === null) continue;
      const x = divider.edge === 'before' ? cx - half : cx + half;
      if (x < 0 || x > width) continue;
      this.dividers.push({ x, label: divider.label });
    }
  }

  renderer(): IPrimitivePaneRenderer {
    return new ReplayDividerRenderer(this.dividers);
  }

  zOrder(): PrimitivePaneViewZOrder {
    return 'top';
  }
}

export class ReplayBandPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApiBase<Time> | null = null;
  private series: ISeriesApi<'Candlestick'> | null = null;
  private requestUpdate?: () => void;
  private bands: ReplayBand[] = [];
  private dividers: ReplayDivider[] = [];
  private readonly paneView = new ReplayBandPaneView(this);
  private readonly dividerView = new ReplayDividerPaneView(this);

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

  setData(bands: ReplayBand[], dividers: ReplayDivider[] = []): void {
    this.bands = bands;
    this.dividers = dividers;
    this.requestUpdate?.();
  }

  updateAllViews(): void {
    this.paneView.update();
    this.dividerView.update();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView, this.dividerView];
  }

  state(): {
    chart: IChartApiBase<Time> | null;
    series: ISeriesApi<'Candlestick'> | null;
    bands: ReplayBand[];
    dividers: ReplayDivider[];
  } {
    return {
      chart: this.chart,
      series: this.series,
      bands: this.bands,
      dividers: this.dividers,
    };
  }
}
