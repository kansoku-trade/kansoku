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
import { theme } from '@web/lib/theme';

export interface PositionBoxData {
  startTime: number;
  endTime: number;
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  dimmed: boolean;
}

type DrawTarget = Parameters<IPrimitivePaneRenderer['draw']>[0];

interface BlockPx {
  x1: number;
  x2: number;
  yTop: number;
  yBottom: number;
  fill: string;
  stroke: string;
}

interface DividerPx {
  x1: number;
  x2: number;
  y: number;
  color: string;
}

interface TagPx {
  x: number;
  y: number;
  color: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = hex.replace('#', '');
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}

const [UR, UG, UB] = hexToRgb(theme.up);
const [DR, DG, DB] = hexToRgb(theme.down);

const upRgba = (alpha: number) => `rgba(${UR}, ${UG}, ${UB}, ${alpha})`;
const downRgba = (alpha: number) => `rgba(${DR}, ${DG}, ${DB}, ${alpha})`;

const STOP_FILL_ALPHA = 0.18;
const STOP_STROKE_ALPHA = 0.7;
const NEAR_FILL_ALPHA = 0.12;
const NEAR_STROKE_ALPHA = 0.5;
const FAR_FILL_ALPHA = 0.22;
const FAR_STROKE_ALPHA = 0.7;
const DIVIDER_ALPHA = 0.9;
const DIMMED_MULT = 0.5;
const STOPPED_TAG = '已止损';

class PositionBoxRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly blocks: BlockPx[],
    private readonly divider: DividerPx | null,
    private readonly tag: TagPx | null,
  ) {}

  draw(target: DrawTarget): void {
    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context;
      ctx.save();
      ctx.lineWidth = 1;
      for (const b of this.blocks) {
        const w = b.x2 - b.x1;
        const h = b.yBottom - b.yTop;
        if (w <= 0 || h <= 0) continue;
        ctx.fillStyle = b.fill;
        ctx.fillRect(b.x1, b.yTop, w, h);
        ctx.strokeStyle = b.stroke;
        ctx.strokeRect(b.x1 + 0.5, b.yTop + 0.5, w - 1, h - 1);
      }
      if (this.divider) {
        ctx.strokeStyle = this.divider.color;
        ctx.beginPath();
        ctx.moveTo(this.divider.x1, this.divider.y + 0.5);
        ctx.lineTo(this.divider.x2, this.divider.y + 0.5);
        ctx.stroke();
      }
      if (this.tag) {
        ctx.font = '10px sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = this.tag.color;
        ctx.fillText(STOPPED_TAG, this.tag.x, this.tag.y);
      }
      ctx.restore();
    });
  }
}

class PositionBoxPaneView implements IPrimitivePaneView {
  private blocks: BlockPx[] = [];
  private divider: DividerPx | null = null;
  private tag: TagPx | null = null;

  constructor(private readonly source: PositionBoxPrimitive) {}

  update(): void {
    const { chart, series, data } = this.source.state();
    this.blocks = [];
    this.divider = null;
    this.tag = null;
    if (!chart || !series || !data) return;
    const ts = chart.timeScale();
    const visible = ts.getVisibleRange();
    // paneSize(), not timeScale().width(): the latter reports 0 when the time axis is hidden, which
    // collapses the box to nothing on a chart that renders no axes.
    const right = chart.paneSize().width;

    const xStart = ts.timeToCoordinate(data.startTime as Time);
    let x1: number;
    if (xStart === null) {
      if (visible && data.startTime < (visible.from as number)) x1 = 0;
      else return;
    } else {
      x1 = xStart;
    }
    const xEnd = ts.timeToCoordinate(data.endTime as Time);
    let x2: number;
    if (xEnd === null) {
      if (visible && data.endTime > (visible.to as number)) x2 = right;
      else return;
    } else {
      x2 = xEnd;
    }
    // A trade entered and closed on the same bar has startTime === endTime and would otherwise
    // collapse to zero width — the one trade shape that most needs to be seen would be the one
    // that never draws.
    const minWidth = ts.options().barSpacing;
    if (x2 - x1 < minWidth) {
      const mid = (x1 + x2) / 2;
      x1 = mid - minWidth / 2;
      x2 = mid + minWidth / 2;
    }
    x1 = Math.max(0, x1);
    x2 = Math.min(right, x2);
    if (x2 <= x1) return;

    const yEntry = series.priceToCoordinate(data.entry);
    const yStop = series.priceToCoordinate(data.stop);
    const yT1 = series.priceToCoordinate(data.target1);
    const yT2 = series.priceToCoordinate(data.target2);
    if (yEntry === null || yStop === null || yT1 === null || yT2 === null) return;

    const dim = data.dimmed ? DIMMED_MULT : 1;
    const stopBlock: BlockPx = {
      x1,
      x2,
      yTop: Math.min(yEntry, yStop),
      yBottom: Math.max(yEntry, yStop),
      fill: downRgba(STOP_FILL_ALPHA * dim),
      stroke: downRgba(STOP_STROKE_ALPHA * dim),
    };
    const nearBlock: BlockPx = {
      x1,
      x2,
      yTop: Math.min(yEntry, yT1),
      yBottom: Math.max(yEntry, yT1),
      fill: upRgba(NEAR_FILL_ALPHA * dim),
      stroke: upRgba(NEAR_STROKE_ALPHA * dim),
    };
    const farBlock: BlockPx = {
      x1,
      x2,
      yTop: Math.min(yT1, yT2),
      yBottom: Math.max(yT1, yT2),
      fill: upRgba(FAR_FILL_ALPHA * dim),
      stroke: upRgba(FAR_STROKE_ALPHA * dim),
    };
    this.blocks = [stopBlock, nearBlock, farBlock];
    this.divider = { x1, x2, y: yT1, color: upRgba(DIVIDER_ALPHA * dim) };
    if (data.dimmed) {
      const yTopAll = Math.min(stopBlock.yTop, nearBlock.yTop, farBlock.yTop);
      this.tag = { x: x1 + 4, y: yTopAll + 9, color: downRgba(0.9) };
    }
  }

  renderer(): IPrimitivePaneRenderer {
    return new PositionBoxRenderer(this.blocks, this.divider, this.tag);
  }

  zOrder(): PrimitivePaneViewZOrder {
    return 'bottom';
  }
}

export class PositionBoxPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApiBase<Time> | null = null;
  private series: ISeriesApi<'Candlestick'> | null = null;
  private requestUpdate?: () => void;
  private data: PositionBoxData | null = null;
  private readonly paneView = new PositionBoxPaneView(this);

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

  setData(data: PositionBoxData | null): void {
    this.data = data;
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
    data: PositionBoxData | null;
  } {
    return { chart: this.chart, series: this.series, data: this.data };
  }
}
