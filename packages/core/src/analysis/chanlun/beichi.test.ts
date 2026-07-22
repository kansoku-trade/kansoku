import type { Bi, Fenxing, Xianduan } from '@kansoku/shared/types';
import { describe, expect, it } from 'vitest';
import { detectBeichi } from './beichi.js';

function fenxing(price: number): Fenxing {
  return { time: 0, price, kind: 'bottom', confirmed: true, barIndex: 0 };
}

function bi(startPrice: number, endPrice: number): Bi {
  return { start: fenxing(startPrice), end: fenxing(endPrice), direction: 'up', bars: 1 };
}

function xianduan(
  direction: 'up' | 'down',
  startTime: number,
  endTime: number | null,
  prices: number[],
): Xianduan {
  const bis: Bi[] = [];
  for (let i = 0; i < prices.length - 1; i++) {
    bis.push(bi(prices[i], prices[i + 1]));
  }
  return { bis, direction, startTime, endTime, broken: endTime !== null };
}

describe('detectBeichi', () => {
  it('returns an empty array for empty input', () => {
    expect(detectBeichi([], [], [])).toEqual([]);
  });

  it('returns an empty array below the 3-xianduan minimum', () => {
    const barTimes = [1000, 1060, 1120];
    const macdHist: (number | null)[] = [1, 2, 3];

    expect(detectBeichi([xianduan('up', 1000, 1120, [90, 100])], barTimes, macdHist)).toEqual([]);

    expect(
      detectBeichi(
        [xianduan('up', 1000, 1060, [90, 100]), xianduan('down', 1060, 1120, [100, 92])],
        barTimes,
        macdHist,
      ),
    ).toEqual([]);
  });

  it('flags a standard up-direction divergence between the i-2 and i segments', () => {
    const barTimes = [1000, 1060, 1120, 1180, 1240, 1300, 1360];
    const macdHist: (number | null)[] = [5, 7, 8, -3, 4, 8, null];

    const xianduans = [
      xianduan('up', 1000, 1120, [85, 100]),
      xianduan('down', 1120, 1240, [100, 90]),
      xianduan('up', 1240, 1300, [95, 105]),
    ];

    const result = detectBeichi(xianduans, barTimes, macdHist);

    expect(result).toEqual([
      {
        fromSegmentIdx: 0,
        toSegmentIdx: 2,
        direction: 'up',
        fromExtreme: 100,
        toExtreme: 105,
        fromArea: 20,
        toArea: 12,
      },
    ]);
  });

  it('does not flag when the curr segment fails to make a new extreme', () => {
    const barTimes = [1000, 1060, 1120, 1180, 1240];
    const macdHist: (number | null)[] = [5, 5, 5, 5, 5];

    const xianduans = [
      xianduan('up', 1000, 1120, [85, 100]),
      xianduan('down', 1120, 1180, [100, 90]),
      xianduan('up', 1180, 1240, [90, 98]),
    ];

    expect(detectBeichi(xianduans, barTimes, macdHist)).toEqual([]);
  });

  it('does not flag when the new extreme is reached but the area is not strictly weaker', () => {
    const barTimes = [1000, 1060, 1120, 1180, 1240];
    const macdHist: (number | null)[] = [5, 7, 8, -2, 18];

    const xianduans = [
      xianduan('up', 1000, 1120, [85, 100]),
      xianduan('down', 1120, 1180, [100, 90]),
      xianduan('up', 1180, 1240, [95, 105]),
    ];

    expect(detectBeichi(xianduans, barTimes, macdHist)).toEqual([]);
  });

  it('flags a standard down-direction divergence, mirroring the up case', () => {
    const barTimes = [1000, 1060, 1120, 1180, 1240, 1300, 1360];
    const macdHist: (number | null)[] = [5, 7, 8, -3, 4, 8, null];

    const xianduans = [
      xianduan('down', 1000, 1120, [95, 80]),
      xianduan('up', 1120, 1240, [80, 90]),
      xianduan('down', 1240, 1300, [85, 75]),
    ];

    const result = detectBeichi(xianduans, barTimes, macdHist);

    expect(result).toEqual([
      {
        fromSegmentIdx: 0,
        toSegmentIdx: 2,
        direction: 'down',
        fromExtreme: 80,
        toExtreme: 75,
        fromArea: 20,
        toArea: 12,
      },
    ]);
  });

  it('checks all eligible pairs across five segments and flags only the qualifying one', () => {
    const barTimes = [1000, 1060, 1120, 1180, 1240, 1300, 1360, 1420, 1480, 1540, 1600];
    const macdHist: (number | null)[] = [5, 5, 5, -2, 5, 5, 5, -1, 2, 3, 4];

    const xianduans = [
      xianduan('up', 1000, 1120, [85, 100]),
      xianduan('down', 1120, 1240, [100, 90]),
      xianduan('up', 1240, 1360, [90, 98]),
      xianduan('down', 1360, 1480, [98, 92]),
      xianduan('up', 1480, 1600, [100, 110]),
    ];

    const result = detectBeichi(xianduans, barTimes, macdHist);

    expect(result).toEqual([
      {
        fromSegmentIdx: 2,
        toSegmentIdx: 4,
        direction: 'up',
        fromExtreme: 98,
        toExtreme: 110,
        fromArea: 15,
        toArea: 9,
      },
    ]);
  });

  it('flags two consecutive divergences across five segments, in order', () => {
    const barTimes = [1000, 1060, 1120, 1180, 1240, 1300, 1360, 1420, 1480, 1540, 1600];
    const macdHist: (number | null)[] = [10, 10, 10, -1, 6, 7, 7, -2, 3, 3, 4];

    const xianduans = [
      xianduan('up', 1000, 1120, [85, 100]),
      xianduan('down', 1120, 1240, [100, 88]),
      xianduan('up', 1240, 1360, [95, 105]),
      xianduan('down', 1360, 1480, [98, 90]),
      xianduan('up', 1480, 1600, [100, 110]),
    ];

    const result = detectBeichi(xianduans, barTimes, macdHist);

    expect(result).toEqual([
      {
        fromSegmentIdx: 0,
        toSegmentIdx: 2,
        direction: 'up',
        fromExtreme: 100,
        toExtreme: 105,
        fromArea: 30,
        toArea: 20,
      },
      {
        fromSegmentIdx: 2,
        toSegmentIdx: 4,
        direction: 'up',
        fromExtreme: 105,
        toExtreme: 110,
        fromArea: 20,
        toArea: 10,
      },
    ]);
  });

  it('treats null macd-hist values as a zero contribution to the area sum', () => {
    const barTimes = [1000, 1060, 1120, 1180, 1240];
    const macdHist: (number | null)[] = [5, 5, 5, null, 9];

    const xianduans = [
      xianduan('up', 1000, 1120, [85, 100]),
      xianduan('down', 1120, 1180, [100, 90]),
      xianduan('up', 1180, 1240, [95, 105]),
    ];

    const result = detectBeichi(xianduans, barTimes, macdHist);

    expect(result).toEqual([
      {
        fromSegmentIdx: 0,
        toSegmentIdx: 2,
        direction: 'up',
        fromExtreme: 100,
        toExtreme: 105,
        fromArea: 15,
        toArea: 9,
      },
    ]);
  });

  it('extends a pending curr segment bar-range to the last available bar', () => {
    const barTimes = [1000, 1060, 1120, 1180, 1240, 1300];
    const macdHist: (number | null)[] = [5, 5, 5, 3, 4, 2];

    const xianduans = [
      xianduan('up', 1000, 1120, [85, 100]),
      xianduan('down', 1120, 1180, [100, 90]),
      xianduan('up', 1180, null, [95, 105]),
    ];

    expect(xianduans[2].endTime).toBeNull();

    const result = detectBeichi(xianduans, barTimes, macdHist);

    expect(result).toEqual([
      {
        fromSegmentIdx: 0,
        toSegmentIdx: 2,
        direction: 'up',
        fromExtreme: 100,
        toExtreme: 105,
        fromArea: 15,
        toArea: 9,
      },
    ]);
  });
});
