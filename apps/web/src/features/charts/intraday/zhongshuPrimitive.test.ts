import type { PriceRectangle } from '@kansoku/shared/types';
import type { SeriesAttachedParameter, Time } from 'lightweight-charts';
import { describe, expect, it, vi } from 'vitest';
import { ZhongshuPrimitive } from './zhongshuPrimitive';

function zone(startTime: number, endTime: number): PriceRectangle {
  return {
    startTime,
    endTime,
    priceLow: 10,
    priceHigh: 30,
    color: 'gray',
    group: 'zhongshu',
  };
}

describe('ZhongshuPrimitive', () => {
  it('uses the translucent fill for every rectangle after drawing a label', () => {
    const primitive = new ZhongshuPrimitive();
    const chart = {
      timeScale: () => ({
        getVisibleRange: () => ({ from: 0, to: 100 }),
        width: () => 100,
        timeToCoordinate: (time: Time) => Number(time),
      }),
    };
    const series = {
      priceToCoordinate: (price: number) => price,
    };

    primitive.attached({
      chart,
      series,
      requestUpdate: vi.fn(),
    } as unknown as SeriesAttachedParameter<Time>);
    primitive.setData([zone(10, 30), zone(40, 60)]);
    primitive.updateAllViews();

    const fillStyles: unknown[] = [];
    const context = {
      fillStyle: '',
      fillRect: vi.fn(() => fillStyles.push(context.fillStyle)),
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

    const paneView = primitive.paneViews()[0];
    expect(paneView).toBeDefined();
    const renderer = paneView!.renderer();
    expect(renderer).toBeDefined();
    renderer!.draw(target as never);

    expect(fillStyles).toEqual(['rgba(128, 128, 128, 0.15)', 'rgba(128, 128, 128, 0.15)']);
  });
});
