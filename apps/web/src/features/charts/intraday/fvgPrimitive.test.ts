// @vitest-environment jsdom
import type { IntradayFvgZone } from '@kansoku/shared/types';
import type { MouseEventParams, SeriesAttachedParameter, Time } from 'lightweight-charts';
import { describe, expect, it, vi } from 'vitest';
import { FvgPrimitive, formatFvgTooltip, fvgZoneId } from './fvgPrimitive';

const zone: IntradayFvgZone = {
  activeHigh: 11,
  activeLow: 10,
  ageBars: 20,
  gapRatio: 0.18,
  high: 12,
  kind: 'bullish',
  low: 10,
  mitigationRatio: 0.5,
  startTime: 10,
};

describe('FvgPrimitive', () => {
  it('draws only the remaining zone and stops one bar after the latest candle', () => {
    const subscribeCrosshairMove = vi.fn();
    const unsubscribeCrosshairMove = vi.fn();
    const primitive = new FvgPrimitive();
    const chart = {
      subscribeCrosshairMove,
      timeScale: () => ({
        getVisibleRange: () => ({ from: 0, to: 100 }),
        options: () => ({ barSpacing: 8 }),
        timeToCoordinate: (time: Time) => (Number(time) === 10 ? 50 : 150),
        width: () => 400,
      }),
      unsubscribeCrosshairMove,
    };
    const series = {
      priceToCoordinate: (price: number) => 200 - price * 10,
    };

    primitive.attached({
      chart,
      series,
      requestUpdate: vi.fn(),
    } as unknown as SeriesAttachedParameter<Time>);
    primitive.setData([zone], { lastBarTime: 20 });
    primitive.updateAllViews();

    const fillRect = vi.fn();
    const context = {
      fillRect,
      fillStyle: '',
      fillText: vi.fn(),
      font: '',
      lineWidth: 0,
      restore: vi.fn(),
      save: vi.fn(),
      strokeRect: vi.fn(),
      strokeStyle: '',
      textBaseline: '',
    };
    const target = {
      useMediaCoordinateSpace: (draw: (scope: { context: typeof context }) => void) =>
        draw({ context }),
    };

    primitive
      .paneViews()[0]
      ?.renderer()
      ?.draw(target as never);

    expect(fillRect).toHaveBeenCalledWith(50, 90, 108, 10);
    expect(primitive.hitTest(100, 85)).toMatchObject({
      cursorStyle: 'help',
      externalId: fvgZoneId(zone),
    });
    expect(primitive.hitTest(200, 85)).toBeNull();

    primitive.detached();
    expect(subscribeCrosshairMove).toHaveBeenCalledOnce();
    expect(unsubscribeCrosshairMove).toHaveBeenCalledOnce();
  });

  it('uses the primitive object id to highlight the hovered zone', () => {
    let onMove: ((param: MouseEventParams<Time>) => void) | undefined;
    const requestUpdate = vi.fn();
    const primitive = new FvgPrimitive();
    primitive.attached({
      chart: {
        subscribeCrosshairMove: (handler: (param: MouseEventParams<Time>) => void) => {
          onMove = handler;
        },
        timeScale: () => ({
          getVisibleRange: () => ({ from: 0, to: 100 }),
          options: () => ({ barSpacing: 8 }),
          timeToCoordinate: () => 50,
          width: () => 400,
        }),
        unsubscribeCrosshairMove: vi.fn(),
      },
      series: { priceToCoordinate: (price: number) => price },
      requestUpdate,
    } as unknown as SeriesAttachedParameter<Time>);
    primitive.setData([zone]);

    onMove?.({ hoveredObjectId: fvgZoneId(zone) } as MouseEventParams<Time>);

    expect(primitive.state().hoveredId).toBe(fvgZoneId(zone));
    expect(requestUpdate).toHaveBeenCalled();
  });
});

describe('formatFvgTooltip', () => {
  it('reports direction, remaining range, mitigation, age and distance', () => {
    expect(formatFvgTooltip(zone, { currentPrice: 20, timeframeLabel: '1h' })).toBe(
      '看涨 FVG · 1h\n' +
        '原始 $10.00–$12.00\n' +
        '剩余 $10.00–$11.00 · 已回补 50%\n' +
        '20 根 K 线前 · 宽度 18.00% · 距现价 45.00% · 下方',
    );
  });
});
