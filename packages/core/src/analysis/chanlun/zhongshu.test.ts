import type { Bi, Fenxing, Xianduan } from '@kansoku/shared/types';
import { describe, expect, it } from 'vitest';
import { detectZhongshu } from './zhongshu.js';

function fenxing(kind: 'top' | 'bottom', barIndex: number, price: number): Fenxing {
  return { time: barIndex * 60, price, kind, confirmed: true, barIndex };
}

function xianduan(
  direction: 'up' | 'down',
  startTime: number,
  endTime: number | null,
  prices: number[],
): Xianduan {
  const bis: Bi[] = [];
  let kind: 'top' | 'bottom' = direction === 'up' ? 'bottom' : 'top';

  for (let i = 0; i < prices.length - 1; i++) {
    const start = fenxing(kind, i * 5, prices[i]);
    kind = kind === 'bottom' ? 'top' : 'bottom';
    const end = fenxing(kind, i * 5 + 5, prices[i + 1]);

    bis.push({
      start,
      end,
      direction: start.kind === 'bottom' ? 'up' : 'down',
      bars: end.barIndex - start.barIndex + 1,
    });
  }

  return { bis, direction, startTime, endTime, broken: endTime !== null };
}

describe('detectZhongshu', () => {
  it('returns an empty array for empty input', () => {
    expect(detectZhongshu([])).toEqual([]);
  });

  it('returns an empty array below the 3-xianduan minimum', () => {
    const xianduans = [
      xianduan('up', 1000, 2000, [90, 100]),
      xianduan('down', 2000, null, [100, 92]),
    ];

    expect(detectZhongshu(xianduans)).toEqual([]);
  });

  it('finds no zhongshu across three xianduans with disjoint price ranges', () => {
    const xianduans = [
      xianduan('up', 1000, 2000, [95, 105]),
      xianduan('down', 2000, 3000, [120, 110]),
      xianduan('up', 3000, null, [125, 135]),
    ];

    expect(detectZhongshu(xianduans)).toEqual([]);
  });

  it('forms one active zhongshu from three overlapping xianduans with no further input', () => {
    const xianduans = [
      xianduan('up', 1000, 2000, [90, 105]),
      xianduan('down', 2000, 3000, [110, 95]),
      xianduan('up', 3000, null, [92, 108]),
    ];

    const result = detectZhongshu(xianduans);

    expect(result).toHaveLength(1);
    const zs = result[0];
    expect(zs.priceLow).toBe(95);
    expect(zs.priceHigh).toBe(105);
    expect(zs.startTime).toBe(xianduans[0].startTime);
    expect(zs.endTime).toBeNull();
    expect(zs.coreSegments).toHaveLength(3);
    expect(zs.coreSegments).toEqual(xianduans);
    expect(zs.extendedBy).toEqual([]);
  });

  it('extends the zhongshu by one overlapping xianduan when input is then exhausted', () => {
    const xianduans = [
      xianduan('up', 1000, 2000, [90, 105]),
      xianduan('down', 2000, 3000, [110, 95]),
      xianduan('up', 3000, 4000, [92, 108]),
      xianduan('down', 4000, null, [103, 98]),
    ];

    const result = detectZhongshu(xianduans);

    expect(result).toHaveLength(1);
    const zs = result[0];
    expect(zs.priceLow).toBe(95);
    expect(zs.priceHigh).toBe(105);
    expect(zs.startTime).toBe(xianduans[0].startTime);
    expect(zs.endTime).toBeNull();
    expect(zs.coreSegments).toHaveLength(3);
    expect(zs.extendedBy).toHaveLength(1);
    expect(zs.extendedBy[0]).toBe(xianduans[3]);
  });

  it('terminates the zhongshu when the fourth xianduan breaks entirely above the range', () => {
    const xianduans = [
      xianduan('up', 1000, 2000, [90, 105]),
      xianduan('down', 2000, 3000, [110, 95]),
      xianduan('up', 3000, 5000, [92, 108]),
      xianduan('up', 5000, null, [120, 130]),
    ];

    const result = detectZhongshu(xianduans);

    expect(result).toHaveLength(1);
    const zs = result[0];
    expect(zs.priceLow).toBe(95);
    expect(zs.priceHigh).toBe(105);
    expect(zs.startTime).toBe(xianduans[0].startTime);
    expect(zs.coreSegments).toHaveLength(3);
    expect(zs.extendedBy).toEqual([]);
    expect(zs.endTime).toBe(xianduans[2].endTime);
    expect(zs.endTime).toBe(5000);
  });

  it('terminates the zhongshu after one accepted extension followed by a non-overlapping xianduan', () => {
    const xianduans = [
      xianduan('up', 1000, 2000, [90, 105]),
      xianduan('down', 2000, 3000, [110, 95]),
      xianduan('up', 3000, 4000, [92, 108]),
      xianduan('down', 4000, 6000, [103, 98]),
      xianduan('up', 6000, null, [120, 130]),
    ];

    const result = detectZhongshu(xianduans);

    expect(result).toHaveLength(1);
    const zs = result[0];
    expect(zs.priceLow).toBe(95);
    expect(zs.priceHigh).toBe(105);
    expect(zs.startTime).toBe(xianduans[0].startTime);
    expect(zs.coreSegments).toHaveLength(3);
    expect(zs.extendedBy).toHaveLength(1);
    expect(zs.extendedBy[0]).toBe(xianduans[3]);
    expect(zs.endTime).toBe(xianduans[3].endTime);
    expect(zs.endTime).toBe(6000);
  });

  it('detects two consecutive zhongshus when a xianduan escapes the first range and forms a second', () => {
    const xianduans = [
      xianduan('up', 1000, 2000, [90, 105]),
      xianduan('down', 2000, 3000, [110, 95]),
      xianduan('up', 3000, 4000, [92, 108]),
      xianduan('down', 4000, 5000, [135, 120]),
      xianduan('up', 5000, 6000, [125, 140]),
      xianduan('down', 6000, null, [138, 122]),
    ];

    const result = detectZhongshu(xianduans);

    expect(result).toHaveLength(2);

    const zsA = result[0];
    expect(zsA.priceLow).toBe(95);
    expect(zsA.priceHigh).toBe(105);
    expect(zsA.startTime).toBe(xianduans[0].startTime);
    expect(zsA.coreSegments).toHaveLength(3);
    expect(zsA.extendedBy).toEqual([]);
    expect(zsA.endTime).toBe(xianduans[2].endTime);

    const zsB = result[1];
    expect(zsB.priceLow).toBe(125);
    expect(zsB.priceHigh).toBe(135);
    expect(zsB.startTime).toBe(xianduans[3].startTime);
    expect(zsB.coreSegments).toHaveLength(3);
    expect(zsB.coreSegments).toEqual([xianduans[3], xianduans[4], xianduans[5]]);
    expect(zsB.extendedBy).toEqual([]);
    expect(zsB.endTime).toBeNull();
  });

  it('derives priceLow/priceHigh from every fenxing endpoint in a segment, not just its first and last bi', () => {
    const xianduans = [
      xianduan('up', 1000, 2000, [95, 100, 92, 105, 98]),
      xianduan('down', 2000, 3000, [120, 80]),
      xianduan('up', 3000, null, [85, 115]),
    ];

    const result = detectZhongshu(xianduans);

    expect(result).toHaveLength(1);
    const zs = result[0];
    expect(zs.priceLow).toBe(92);
    expect(zs.priceHigh).toBe(105);
    expect(zs.startTime).toBe(xianduans[0].startTime);
    expect(zs.endTime).toBeNull();
    expect(zs.coreSegments).toHaveLength(3);
    expect(zs.extendedBy).toEqual([]);
  });

  it('keeps the zhongshu active when the last input xianduan is itself pending and still overlaps', () => {
    const xianduans = [
      xianduan('down', 10_000, 11_000, [140, 120]),
      xianduan('up', 11_000, 12_000, [115, 135]),
      xianduan('down', 12_000, 13_000, [138, 118]),
      xianduan('up', 13_000, null, [122, 128]),
    ];

    expect(xianduans[3].endTime).toBeNull();

    const result = detectZhongshu(xianduans);

    expect(result).toHaveLength(1);
    const zs = result[0];
    expect(zs.priceLow).toBe(120);
    expect(zs.priceHigh).toBe(135);
    expect(zs.startTime).toBe(xianduans[0].startTime);
    expect(zs.coreSegments).toHaveLength(3);
    expect(zs.extendedBy).toHaveLength(1);
    expect(zs.extendedBy[0]).toBe(xianduans[3]);
    expect(zs.extendedBy[0].endTime).toBeNull();
    expect(zs.endTime).toBeNull();
  });
});
