import type { IChartApi, ISeriesPrimitive, Time } from 'lightweight-charts';

interface BitmapScope {
  context: CanvasRenderingContext2D;
  horizontalPixelRatio: number;
  bitmapSize: { width: number; height: number };
}

interface RenderTarget {
  useBitmapCoordinateSpace: (callback: (scope: BitmapScope) => void) => void;
}

function makePrimitive(draw: (target: RenderTarget) => void): ISeriesPrimitive<Time> {
  const renderer = { draw };
  const paneView = {
    renderer: () => renderer,
    zOrder: () => 'bottom' as const,
    update: () => {},
  };
  return {
    updateAllViews() {},
    paneViews() {
      return [paneView];
    },
    attached() {},
    detached() {},
  } as unknown as ISeriesPrimitive<Time>;
}

export function createHistoricalBackground(
  chart: IChartApi,
  splitTime: number | string | null,
): ISeriesPrimitive<Time> | null {
  if (splitTime == null) return null;
  return makePrimitive((target) => {
    target.useBitmapCoordinateSpace((scope) => {
      const x = chart.timeScale().timeToCoordinate(splitTime as Time);
      if (x == null) return;
      const ctx = scope.context;
      const dpr = scope.horizontalPixelRatio;
      const cutX = Math.round((x + 0.5) * dpr);
      const h = scope.bitmapSize.height;
      ctx.save();
      ctx.fillStyle = 'rgba(232,232,232,0.05)';
      ctx.fillRect(0, 0, cutX, h);
      ctx.strokeStyle = 'rgba(167,139,250,0.6)';
      ctx.lineWidth = Math.max(1, dpr);
      ctx.setLineDash([Math.max(4, dpr * 3), Math.max(3, dpr * 2)]);
      ctx.beginPath();
      ctx.moveTo(cutX, 0);
      ctx.lineTo(cutX, h);
      ctx.stroke();
      ctx.restore();
    });
  });
}

export function createBarHighlight(
  chart: IChartApi,
  time: number | string | null,
): ISeriesPrimitive<Time> | null {
  if (time == null) return null;
  return makePrimitive((target) => {
    target.useBitmapCoordinateSpace((scope) => {
      const x = chart.timeScale().timeToCoordinate(time as Time);
      if (x == null) return;
      const ctx = scope.context;
      const dpr = scope.horizontalPixelRatio;
      const spacing = (chart.timeScale().options().barSpacing || 6) * dpr;
      const cx = (x + 0.5) * dpr;
      const half = Math.max(3 * dpr, spacing / 2);
      const h = scope.bitmapSize.height;
      ctx.save();
      ctx.fillStyle = 'rgba(167,139,250,0.16)';
      ctx.fillRect(cx - half, 0, half * 2, h);
      ctx.strokeStyle = 'rgba(167,139,250,0.7)';
      ctx.lineWidth = Math.max(1, dpr);
      ctx.strokeRect(cx - half, 0, half * 2, h);
      ctx.restore();
    });
  });
}