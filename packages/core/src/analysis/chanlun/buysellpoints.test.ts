import type { Bi, Fenxing, Xianduan, Zhongshu } from '@kansoku/shared/types';
import { describe, expect, it } from 'vitest';
import type { BeichiEvent } from './beichi.js';
import { detectBuySellPoints } from './buysellpoints.js';

function fenxing(time: number, price: number): Fenxing {
  return { time, price, kind: 'bottom', confirmed: true, barIndex: time };
}

function bi(startTime: number, startPrice: number, endTime: number, endPrice: number): Bi {
  return {
    start: fenxing(startTime, startPrice),
    end: fenxing(endTime, endPrice),
    direction: 'up',
    bars: 1,
  };
}

function xianduan(
  direction: 'up' | 'down',
  startTime: number,
  endTime: number | null,
  points: Array<[number, number]>,
): Xianduan {
  const bis: Bi[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    bis.push(bi(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]));
  }
  return { bis, direction, startTime, endTime, broken: endTime !== null };
}

function filler(startTime: number, endTime: number): Xianduan {
  return xianduan('up', startTime, endTime, [
    [startTime, 0],
    [endTime, 1],
  ]);
}

function zhongshu(
  priceLow: number,
  priceHigh: number,
  startTime: number,
  endTime: number | null,
): Zhongshu {
  return { coreSegments: [], extendedBy: [], priceLow, priceHigh, startTime, endTime };
}

function beichiEvent(
  fromSegmentIdx: number,
  toSegmentIdx: number,
  direction: 'up' | 'down',
): BeichiEvent {
  return {
    fromSegmentIdx,
    toSegmentIdx,
    direction,
    fromExtreme: 0,
    toExtreme: 0,
    fromArea: 0,
    toArea: 0,
  };
}

describe('detectBuySellPoints', () => {
  it('returns an empty array for all empty inputs', () => {
    expect(detectBuySellPoints([], [], [], 'm5')).toEqual([]);
  });

  it('emits a confirmed buy1 at the end of a down beichi segment', () => {
    const toSeg = xianduan('down', 2000, 2600, [
      [2000, 110],
      [2600, 95],
    ]);
    const xianduans = [filler(0, 500), filler(500, 1000), toSeg];
    const beichis = [beichiEvent(0, 2, 'down')];

    const result = detectBuySellPoints(xianduans, [], beichis, 'm5');

    expect(result).toEqual([
      {
        time: 2600,
        price: 95,
        kind: 'buy1',
        timeframe: 'm5',
        refBeichi: { fromSegmentIdx: 0, toSegmentIdx: 2 },
        confirmed: true,
      },
    ]);
  });

  it('emits an unconfirmed buy1 when the beichi segment is still pending', () => {
    const toSeg = xianduan('down', 2000, null, [
      [2000, 110],
      [2600, 95],
    ]);
    const xianduans = [filler(0, 500), filler(500, 1000), toSeg];
    const beichis = [beichiEvent(0, 2, 'down')];

    const result = detectBuySellPoints(xianduans, [], beichis, 'm5');

    expect(result).toEqual([
      {
        time: 2600,
        price: 95,
        kind: 'buy1',
        timeframe: 'm5',
        refBeichi: { fromSegmentIdx: 0, toSegmentIdx: 2 },
        confirmed: false,
      },
    ]);
  });

  it('emits a confirmed sell1 at the end of an up beichi segment', () => {
    const toSeg = xianduan('up', 2000, 2600, [
      [2000, 95],
      [2600, 112],
    ]);
    const xianduans = [filler(0, 500), filler(500, 1000), toSeg];
    const beichis = [beichiEvent(0, 2, 'up')];

    const result = detectBuySellPoints(xianduans, [], beichis, 'm5');

    expect(result).toEqual([
      {
        time: 2600,
        price: 112,
        kind: 'sell1',
        timeframe: 'm5',
        refBeichi: { fromSegmentIdx: 0, toSegmentIdx: 2 },
        confirmed: true,
      },
    ]);
  });

  it('emits buy2 when the bounce retracement holds strictly above buy1', () => {
    const toSeg = xianduan('down', 2000, 2600, [
      [2000, 110],
      [2600, 98],
    ]);
    const bounce = xianduan('up', 2600, 3200, [
      [2600, 98],
      [2900, 108],
      [3200, 100],
    ]);
    const xianduans = [filler(0, 500), filler(500, 1000), toSeg, bounce];
    const beichis = [beichiEvent(0, 2, 'down')];

    const result = detectBuySellPoints(xianduans, [], beichis, 'm5');

    expect(result).toEqual([
      {
        time: 2600,
        price: 98,
        kind: 'buy1',
        timeframe: 'm5',
        refBeichi: { fromSegmentIdx: 0, toSegmentIdx: 2 },
        confirmed: true,
      },
      {
        time: 3200,
        price: 100,
        kind: 'buy2',
        timeframe: 'm5',
        refFirstPoint: { time: 2600, price: 98 },
        confirmed: true,
      },
    ]);
  });

  it('does not emit buy2 when the bounce retracement breaks below buy1', () => {
    const toSeg = xianduan('down', 2000, 2600, [
      [2000, 110],
      [2600, 98],
    ]);
    const bounce = xianduan('up', 2600, 3200, [
      [2600, 98],
      [2900, 108],
      [3200, 97],
    ]);
    const xianduans = [filler(0, 500), filler(500, 1000), toSeg, bounce];
    const beichis = [beichiEvent(0, 2, 'down')];

    const result = detectBuySellPoints(xianduans, [], beichis, 'm5');

    expect(result).toEqual([
      {
        time: 2600,
        price: 98,
        kind: 'buy1',
        timeframe: 'm5',
        refBeichi: { fromSegmentIdx: 0, toSegmentIdx: 2 },
        confirmed: true,
      },
    ]);
  });

  it('emits buy3 when the retracement after an upward escape holds above the zhongshu', () => {
    const escape = xianduan('up', 3000, 3400, [
      [3000, 100],
      [3400, 108],
    ]);
    const retrace = xianduan('down', 3400, 3800, [
      [3400, 108],
      [3800, 101.8],
    ]);
    const xianduans = [filler(0, 1000), filler(1000, 2000), filler(2000, 3000), escape, retrace];
    const zhongshus = [zhongshu(95, 100.5, 0, 3000)];

    const result = detectBuySellPoints(xianduans, zhongshus, [], 'm5');

    expect(result).toEqual([
      {
        time: 3800,
        price: 101.8,
        kind: 'buy3',
        timeframe: 'm5',
        refZhongshu: { startTime: 0, endTime: 3000 },
        confirmed: true,
      },
    ]);
  });

  it('does not emit buy3 when the retracement breaks the zhongshu upper edge', () => {
    const escape = xianduan('up', 3000, 3400, [
      [3000, 100],
      [3400, 108],
    ]);
    const retrace = xianduan('down', 3400, 3800, [
      [3400, 108],
      [3800, 99],
    ]);
    const xianduans = [filler(0, 1000), filler(1000, 2000), filler(2000, 3000), escape, retrace];
    const zhongshus = [zhongshu(95, 100.5, 0, 3000)];

    const result = detectBuySellPoints(xianduans, zhongshus, [], 'm5');

    expect(result).toEqual([]);
  });

  it('combines type-1, type-2, and type-3 points in ascending time order', () => {
    const escape = xianduan('up', 100, 400, [
      [100, 96],
      [400, 110],
    ]);
    const retrace3 = xianduan('down', 400, 900, [
      [400, 110],
      [900, 101],
    ]);
    const toSeg = xianduan('down', 1500, 2100, [
      [1500, 120],
      [2100, 105],
    ]);
    const bounce = xianduan('up', 2100, 2600, [
      [2100, 105],
      [2300, 115],
      [2600, 110],
    ]);
    const xianduans = [escape, retrace3, toSeg, bounce];
    const zhongshus = [zhongshu(90, 98, 0, 100)];
    const beichis = [beichiEvent(0, 2, 'down')];

    const result = detectBuySellPoints(xianduans, zhongshus, beichis, 'm15');

    expect(result).toEqual([
      {
        time: 900,
        price: 101,
        kind: 'buy3',
        timeframe: 'm15',
        refZhongshu: { startTime: 0, endTime: 100 },
        confirmed: true,
      },
      {
        time: 2100,
        price: 105,
        kind: 'buy1',
        timeframe: 'm15',
        refBeichi: { fromSegmentIdx: 0, toSegmentIdx: 2 },
        confirmed: true,
      },
      {
        time: 2600,
        price: 110,
        kind: 'buy2',
        timeframe: 'm15',
        refFirstPoint: { time: 2100, price: 105 },
        confirmed: true,
      },
    ]);
  });

  it('stamps every emitted point with the passed-in timeframe', () => {
    const toSeg = xianduan('down', 2000, 2600, [
      [2000, 110],
      [2600, 95],
    ]);
    const xianduans = [filler(0, 500), filler(500, 1000), toSeg];
    const beichis = [beichiEvent(0, 2, 'down')];

    const result = detectBuySellPoints(xianduans, [], beichis, 'm15');

    expect(result).toHaveLength(1);
    expect(result.every((point) => point.timeframe === 'm15')).toBe(true);
  });
});
