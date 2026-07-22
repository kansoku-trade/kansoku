import type {
  IChartApi,
  IChartApiBase,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  MouseEventParams,
  PrimitiveHoveredItem,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts';
import type { IntradayFvgZone } from '@kansoku/shared/types';
import { theme } from '@web/lib/theme';

type DrawTarget = Parameters<IPrimitivePaneRenderer['draw']>[0];

const FVG_ID_PREFIX = 'fvg-zone:';
const ORIGINAL_STROKE_ALPHA = 0.18;
const ACTIVE_FILL_ALPHA = 0.065;
const ACTIVE_STROKE_ALPHA = 0.52;
const HOVER_FILL_ALPHA = 0.16;
const HOVER_STROKE_ALPHA = 0.82;
const MAX_AGE_BARS = 40;
const LABEL_WIDTH = 34;
const LABEL_HEIGHT = 13;

const hexToRgba = (hex: string, alpha: number): string => {
  if (!/^#[\da-f]{6}$/i.test(hex)) return hex;
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

const clampActiveRange = (zone: IntradayFvgZone) => {
  const activeLow = Math.max(zone.low, Math.min(zone.high, zone.activeLow ?? zone.low));
  const activeHigh = Math.max(activeLow, Math.min(zone.high, zone.activeHigh ?? zone.high));
  return { activeLow, activeHigh };
};

export const fvgZoneId = (zone: IntradayFvgZone): string =>
  `${FVG_ID_PREFIX}${zone.kind}:${zone.startTime}:${zone.low}:${zone.high}`;

export interface FvgDisplayContext {
  currentPrice?: number;
  lastBarTime?: number;
  timeframeLabel?: string;
}

interface RectPx {
  activeYBottom: number;
  activeYTop: number;
  base: string;
  fade: number;
  hovered: boolean;
  id: string;
  kind: IntradayFvgZone['kind'];
  x1: number;
  x2: number;
  yBottom: number;
  yTop: number;
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
        const activeH = r.activeYBottom - r.activeYTop;
        if (w <= 0 || h <= 0 || activeH <= 0) continue;

        ctx.lineWidth = 1;
        ctx.strokeStyle = hexToRgba(r.base, ORIGINAL_STROKE_ALPHA * r.fade);
        ctx.strokeRect(r.x1 + 0.5, r.yTop + 0.5, w - 1, h - 1);

        const fillAlpha = (r.hovered ? HOVER_FILL_ALPHA : ACTIVE_FILL_ALPHA) * r.fade;
        const strokeAlpha = (r.hovered ? HOVER_STROKE_ALPHA : ACTIVE_STROKE_ALPHA) * r.fade;
        ctx.fillStyle = hexToRgba(r.base, fillAlpha);
        ctx.fillRect(r.x1, r.activeYTop, w, activeH);
        ctx.strokeStyle = hexToRgba(r.base, strokeAlpha);
        ctx.strokeRect(r.x1 + 0.5, r.activeYTop + 0.5, w - 1, activeH - 1);

        // 价格第一次回到缺口时会先触及的近端边界保持更清晰。
        const nearEdgeY = r.kind === 'bullish' ? r.activeYTop : r.activeYBottom - 1;
        ctx.fillStyle = hexToRgba(r.base, Math.min(1, strokeAlpha + 0.12));
        ctx.fillRect(r.x1, nearEdgeY, w, 1);

        if (r.x1 > 0 && w >= LABEL_WIDTH + 12) {
          const labelY = Math.max(2, r.yTop + 2);
          ctx.fillStyle = 'rgba(10, 10, 10, 0.82)';
          ctx.fillRect(r.x1 + 3, labelY, LABEL_WIDTH, LABEL_HEIGHT);
          ctx.fillStyle = hexToRgba(r.base, r.hovered ? 1 : 0.78 * r.fade);
          ctx.font = `9px ${theme.fontMono}`;
          ctx.textBaseline = 'middle';
          ctx.fillText(r.kind === 'bullish' ? 'FVG↑' : 'FVG↓', r.x1 + 6, labelY + 7);
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
    const { chart, series, zones, context, hoveredId } = this.source.state();
    this.rects = [];
    if (!chart || !series || zones.length === 0) return;
    const ts = chart.timeScale();
    const visible = ts.getVisibleRange();
    const right = ts.width();
    const barSpacing = ts.options().barSpacing;

    for (const zone of zones) {
      const { activeLow, activeHigh } = clampActiveRange(zone);
      const yHigh = series.priceToCoordinate(zone.high);
      const yLow = series.priceToCoordinate(zone.low);
      const yActiveHigh = series.priceToCoordinate(activeHigh);
      const yActiveLow = series.priceToCoordinate(activeLow);
      if (yHigh === null || yLow === null || yActiveHigh === null || yActiveLow === null) continue;

      const xStart = ts.timeToCoordinate(zone.startTime as Time);
      let x1: number;
      if (xStart === null) {
        if (visible && zone.startTime < (visible.from as number)) x1 = 0;
        else continue;
      } else {
        x1 = xStart;
      }

      let x2 = right;
      if (context.lastBarTime !== undefined) {
        const xEnd = ts.timeToCoordinate(context.lastBarTime as Time);
        if (xEnd !== null) x2 = Math.min(right, xEnd + barSpacing);
        else if (visible && context.lastBarTime < (visible.from as number)) continue;
      }
      if (x2 <= x1) continue;

      const age = Math.max(0, zone.ageBars ?? 0);
      const fade = Math.max(0.45, 1 - (Math.min(age, MAX_AGE_BARS) / MAX_AGE_BARS) * 0.55);
      const id = fvgZoneId(zone);
      this.rects.push({
        activeYBottom: Math.max(yActiveHigh, yActiveLow),
        activeYTop: Math.min(yActiveHigh, yActiveLow),
        base: zone.kind === 'bullish' ? theme.up : theme.down,
        fade,
        hovered: hoveredId === id,
        id,
        kind: zone.kind,
        x1: Math.max(0, x1),
        x2,
        yBottom: Math.max(yHigh, yLow),
        yTop: Math.min(yHigh, yLow),
      });
    }
  }

  hitTest(x: number, y: number): RectPx | null {
    for (let i = this.rects.length - 1; i >= 0; i--) {
      const rect = this.rects[i];
      if (x >= rect.x1 && x <= rect.x2 && y >= rect.yTop && y <= rect.yBottom) return rect;
    }
    return null;
  }

  renderer(): IPrimitivePaneRenderer {
    return new FvgRenderer(this.rects);
  }

  zOrder(): PrimitivePaneViewZOrder {
    return 'bottom';
  }
}

export class FvgPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApiBase<Time> | null = null;
  private context: FvgDisplayContext = {};
  private hoveredId: string | null = null;
  private requestUpdate?: () => void;
  private series: ISeriesApi<'Candlestick'> | null = null;
  private zones: IntradayFvgZone[] = [];
  private readonly paneView = new FvgPaneView(this);

  private readonly onCrosshairMove = (param: MouseEventParams<Time>) => {
    const objectId = param.hoveredObjectId;
    const next =
      typeof objectId === 'string' && objectId.startsWith(FVG_ID_PREFIX) ? objectId : null;
    if (next === this.hoveredId) return;
    this.hoveredId = next;
    this.requestUpdate?.();
  };

  attached(param: SeriesAttachedParameter<Time>): void {
    this.chart = param.chart;
    this.series = param.series as ISeriesApi<'Candlestick'>;
    this.requestUpdate = param.requestUpdate;
    this.chart.subscribeCrosshairMove(this.onCrosshairMove);
  }

  detached(): void {
    this.chart?.unsubscribeCrosshairMove(this.onCrosshairMove);
    this.chart = null;
    this.series = null;
    this.requestUpdate = undefined;
    this.hoveredId = null;
  }

  setData(zones: IntradayFvgZone[], context: FvgDisplayContext = {}): void {
    this.zones = zones;
    this.context = context;
    this.requestUpdate?.();
  }

  updateAllViews(): void {
    this.paneView.update();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView];
  }

  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    const rect = this.paneView.hitTest(x, y);
    return rect
      ? {
          cursorStyle: 'help',
          distance: 0,
          externalId: rect.id,
          hitTestPriority: 0,
          zOrder: 'bottom',
        }
      : null;
  }

  state(): {
    chart: IChartApiBase<Time> | null;
    context: FvgDisplayContext;
    hoveredId: string | null;
    series: ISeriesApi<'Candlestick'> | null;
    zones: IntradayFvgZone[];
  } {
    return {
      chart: this.chart,
      context: this.context,
      hoveredId: this.hoveredId,
      series: this.series,
      zones: this.zones,
    };
  }
}

const formatPrice = (price: number) => `$${price.toFixed(2)}`;

export function formatFvgTooltip(zone: IntradayFvgZone, context: FvgDisplayContext = {}): string {
  const { activeLow, activeHigh } = clampActiveRange(zone);
  const direction = zone.kind === 'bullish' ? '看涨 FVG' : '看跌 FVG';
  const timeframe = context.timeframeLabel ? ` · ${context.timeframeLabel}` : '';
  const mitigation = Math.round((zone.mitigationRatio ?? 0) * 100);
  const gap = zone.gapRatio === undefined ? '' : ` · 宽度 ${(zone.gapRatio * 100).toFixed(2)}%`;
  const age = zone.ageBars === undefined ? '' : `${zone.ageBars} 根 K 线前`;

  let distance = '';
  if (context.currentPrice !== undefined && context.currentPrice > 0) {
    if (context.currentPrice >= activeLow && context.currentPrice <= activeHigh) {
      distance = '现价位于剩余区间内';
    } else {
      const edge = context.currentPrice > activeHigh ? activeHigh : activeLow;
      const pct = (Math.abs(edge - context.currentPrice) / context.currentPrice) * 100;
      distance = `距现价 ${pct.toFixed(2)}% · ${edge < context.currentPrice ? '下方' : '上方'}`;
    }
  }

  return [
    `${direction}${timeframe}`,
    `原始 ${formatPrice(zone.low)}–${formatPrice(zone.high)}`,
    `剩余 ${formatPrice(activeLow)}–${formatPrice(activeHigh)} · 已回补 ${mitigation}%`,
    [age, gap.replace(/^ · /, ''), distance].filter(Boolean).join(' · '),
  ]
    .filter(Boolean)
    .join('\n');
}

export interface FvgTooltipHandle {
  destroy(): void;
  setData(zones: IntradayFvgZone[], context: FvgDisplayContext): void;
}

export function fvgTooltip(chart: IChartApi, host: HTMLElement): FvgTooltipHandle {
  const el = document.createElement('div');
  el.className = 'marker-tooltip fvg-tooltip';
  host.appendChild(el);
  let byId = new Map<string, string>();

  const onMove = (param: Parameters<Parameters<IChartApi['subscribeCrosshairMove']>[0]>[0]) => {
    const id = typeof param.hoveredObjectId === 'string' ? param.hoveredObjectId : undefined;
    const tip = id ? byId.get(id) : undefined;
    if (tip && param.point) {
      el.textContent = tip;
      el.style.display = 'block';
      const x = Math.max(4, Math.min(param.point.x + 14, host.clientWidth - el.offsetWidth - 8));
      const y = Math.max(4, Math.min(param.point.y + 14, host.clientHeight - el.offsetHeight - 8));
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    } else {
      el.style.display = 'none';
    }
  };
  chart.subscribeCrosshairMove(onMove);

  return {
    destroy() {
      chart.unsubscribeCrosshairMove(onMove);
      el.remove();
    },
    setData(zones, context) {
      byId = new Map(zones.map((zone) => [fvgZoneId(zone), formatFvgTooltip(zone, context)]));
    },
  };
}
