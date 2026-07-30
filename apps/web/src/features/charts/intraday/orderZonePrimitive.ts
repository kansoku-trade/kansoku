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

export interface OrderZoneData {
  startTime: number;
  entry: number;
  stop: number;
  target: number | null;
  filled: boolean;
  rewardR: number | null;
  riskR: number;
  belowFloor: boolean;
}

type DrawTarget = Parameters<IPrimitivePaneRenderer['draw']>[0];

interface ZoneBlockPx {
  x1: number;
  x2: number;
  yTop: number;
  yBottom: number;
  fill: string;
  stroke: string | null;
  dashed: boolean;
  hatchColor: string | null;
  text: string | null;
  textColor: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = hex.replace('#', '');
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}

const [UR, UG, UB] = hexToRgb(theme.up);
const [DR, DG, DB] = hexToRgb(theme.down);
const [GR, GG, GB] = hexToRgb(theme.textSecondary);
// A hue of its own: theme.up/down are already risk/reward and textSecondary is the belowFloor
// treatment, and the entry line owns #4a8cff — reusing that hex here would visually merge the
// entry line into this block's own edge, since the entry price is always one of its two edges.
const [SR, SG, SB] = hexToRgb('#8b5cf6');

const upRgba = (alpha: number) => `rgba(${UR}, ${UG}, ${UB}, ${alpha})`;
const downRgba = (alpha: number) => `rgba(${DR}, ${DG}, ${DB}, ${alpha})`;
const grayRgba = (alpha: number) => `rgba(${GR}, ${GG}, ${GB}, ${alpha})`;
const securedRgba = (alpha: number) => `rgba(${SR}, ${SG}, ${SB}, ${alpha})`;

const DRAFT_FILL_ALPHA = 0.1;
const DRAFT_STROKE_ALPHA = 0.45;
const FILLED_FILL_ALPHA = 0.2;
const FILLED_STROKE_ALPHA = 0.75;
const HATCH_ALPHA = 0.35;
const HATCH_SPACING_PX = 6;
const TEXT_ALPHA = 0.95;
const TEXT_PADDING_LEFT_PX = 4;
const TEXT_CHAR_WIDTH_PX = 6;
const TEXT_SIDE_PADDING_PX = 8;
const TEXT_MIN_HEIGHT_PX = 14;
const DASH_PATTERN: [number, number] = [4, 4];

function fitsText(width: number, height: number, text: string): boolean {
  return (
    height >= TEXT_MIN_HEIGHT_PX && width >= text.length * TEXT_CHAR_WIDTH_PX + TEXT_SIDE_PADDING_PX
  );
}

function formatRewardLabel(rewardR: number): string {
  return `+${rewardR.toFixed(1)}R`;
}

function formatRiskLabel(riskR: number): string {
  return `${riskR >= 0 ? '+' : ''}${riskR.toFixed(1)}R`;
}

function drawHatch(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let lineX = x - h; lineX < x + w; lineX += HATCH_SPACING_PX) {
    ctx.beginPath();
    ctx.moveTo(lineX, y + h);
    ctx.lineTo(lineX + h, y);
    ctx.stroke();
  }
  ctx.restore();
}

class OrderZoneRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly blocks: ZoneBlockPx[]) {}

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
        if (b.hatchColor) drawHatch(ctx, b.x1, b.yTop, w, h, b.hatchColor);
        if (b.stroke) {
          ctx.setLineDash(b.dashed ? DASH_PATTERN : []);
          ctx.strokeStyle = b.stroke;
          ctx.strokeRect(b.x1 + 0.5, b.yTop + 0.5, w - 1, h - 1);
          ctx.setLineDash([]);
        }
        if (b.text && fitsText(w, h, b.text)) {
          ctx.font = '10px sans-serif';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = b.textColor;
          ctx.fillText(b.text, b.x1 + TEXT_PADDING_LEFT_PX, (b.yTop + b.yBottom) / 2);
        }
      }
      ctx.restore();
    });
  }
}

class OrderZonePaneView implements IPrimitivePaneView {
  private blocks: ZoneBlockPx[] = [];

  constructor(private readonly source: OrderZonePrimitive) {}

  update(): void {
    const { chart, series, data } = this.source.state();
    this.blocks = [];
    if (!chart || !series || !data) return;
    const ts = chart.timeScale();
    const visible = ts.getVisibleRange();
    // paneSize(), not timeScale().width(): the latter reports 0 when the time axis is hidden, which
    // collapses the zone to nothing on a chart that renders no axes.
    const right = chart.paneSize().width;

    const xStart = ts.timeToCoordinate(data.startTime as Time);
    let x1: number;
    if (xStart === null) {
      // timeToCoordinate returns null once the anchor bar scrolls before the visible range; falling
      // back to the left pane edge keeps the zone drawn instead of vanishing mid-drag.
      if (visible && data.startTime < (visible.from as number)) x1 = 0;
      else return;
    } else {
      x1 = xStart;
    }
    x1 = Math.max(0, x1);
    const x2 = right;
    if (x2 <= x1) return;

    const yEntry = series.priceToCoordinate(data.entry);
    const yStop = series.priceToCoordinate(data.stop);
    if (yEntry === null || yStop === null) return;

    const fillAlpha = data.filled ? FILLED_FILL_ALPHA : DRAFT_FILL_ALPHA;
    const strokeAlpha = data.filled ? FILLED_STROKE_ALPHA : DRAFT_STROKE_ALPHA;
    const dashed = !data.filled;

    const secured = data.riskR >= 0;
    const riskRgba = secured ? securedRgba : downRgba;
    this.blocks.push({
      x1,
      x2,
      yTop: Math.min(yEntry, yStop),
      yBottom: Math.max(yEntry, yStop),
      fill: riskRgba(fillAlpha),
      // The entry price is always one edge of this block; once secured, a stroke here would sit
      // right on top of the entry/stop DOM lines that already mark those boundaries, so it is
      // fill-only rather than adding a third outline colour on the entry line.
      stroke: secured ? null : riskRgba(strokeAlpha),
      dashed,
      hatchColor: null,
      text: formatRiskLabel(data.riskR),
      textColor: riskRgba(TEXT_ALPHA),
    });

    if (data.target === null) return;
    const yTarget = series.priceToCoordinate(data.target);
    if (yTarget === null) return;

    const rewardRgba = data.belowFloor ? grayRgba : upRgba;
    this.blocks.push({
      x1,
      x2,
      yTop: Math.min(yEntry, yTarget),
      yBottom: Math.max(yEntry, yTarget),
      fill: rewardRgba(fillAlpha),
      stroke: rewardRgba(strokeAlpha),
      dashed,
      hatchColor: data.belowFloor ? grayRgba(HATCH_ALPHA) : null,
      text: data.rewardR === null ? null : formatRewardLabel(data.rewardR),
      textColor: data.belowFloor ? downRgba(TEXT_ALPHA) : upRgba(TEXT_ALPHA),
    });
  }

  renderer(): IPrimitivePaneRenderer {
    return new OrderZoneRenderer(this.blocks);
  }

  zOrder(): PrimitivePaneViewZOrder {
    return 'bottom';
  }
}

export class OrderZonePrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApiBase<Time> | null = null;
  private series: ISeriesApi<'Candlestick'> | null = null;
  private requestUpdate?: () => void;
  private data: OrderZoneData | null = null;
  private readonly paneView = new OrderZonePaneView(this);

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

  setData(data: OrderZoneData | null): void {
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
    data: OrderZoneData | null;
  } {
    return { chart: this.chart, series: this.series, data: this.data };
  }
}
