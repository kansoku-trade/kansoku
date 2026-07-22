import type { Bi, Fenxing } from '@kansoku/shared/types';
import { describe, expect, it } from 'vitest';
import { detectXianduan } from './xianduan.js';

function fenxing(kind: 'top' | 'bottom', barIndex: number, price: number): Fenxing {
  return { time: barIndex * 60, price, kind, confirmed: true, barIndex };
}

function bi(start: Fenxing, end: Fenxing): Bi {
  return {
    start,
    end,
    direction: start.kind === 'bottom' ? 'up' : 'down',
    bars: end.barIndex - start.barIndex + 1,
  };
}

function biChain(points: { kind: 'top' | 'bottom'; bar: number; price: number }[]): Bi[] {
  const fenxings = points.map((p) => fenxing(p.kind, p.bar, p.price));
  return fenxings.slice(1).map((end, i) => bi(fenxings[i], end));
}

describe('detectXianduan', () => {
  it('returns an empty array for empty input', () => {
    expect(detectXianduan([])).toEqual([]);
  });

  it('returns an empty array below the 3-bi minimum', () => {
    const bis = biChain([
      { kind: 'bottom', bar: 0, price: 90 },
      { kind: 'top', bar: 5, price: 100 },
      { kind: 'bottom', bar: 10, price: 94 },
    ]);

    expect(detectXianduan(bis)).toEqual([]);
  });

  it('forms one pending up-segment from three alternating bis with a valid extension', () => {
    const bis = biChain([
      { kind: 'bottom', bar: 0, price: 90 },
      { kind: 'top', bar: 5, price: 100 },
      { kind: 'bottom', bar: 10, price: 94 },
      { kind: 'top', bar: 15, price: 105 },
    ]);

    const result = detectXianduan(bis);

    expect(result).toEqual([
      {
        bis,
        direction: 'up',
        startTime: bis[0].start.time,
        endTime: null,
        broken: false,
      },
    ]);
    expect(result[0].bis).toHaveLength(3);
  });

  it('rejects a 3-bi run whose closing bi fails to extend the opening bi', () => {
    const bis = biChain([
      { kind: 'bottom', bar: 0, price: 90 },
      { kind: 'top', bar: 5, price: 100 },
      { kind: 'bottom', bar: 10, price: 94 },
      { kind: 'top', bar: 15, price: 98 },
    ]);

    expect(detectXianduan(bis)).toEqual([]);
  });

  it('forms one pending down-segment mirroring the up case', () => {
    const bis = biChain([
      { kind: 'top', bar: 0, price: 110 },
      { kind: 'bottom', bar: 5, price: 100 },
      { kind: 'top', bar: 10, price: 106 },
      { kind: 'bottom', bar: 15, price: 95 },
    ]);

    const result = detectXianduan(bis);

    expect(result).toEqual([
      {
        bis,
        direction: 'down',
        startTime: bis[0].start.time,
        endTime: null,
        broken: false,
      },
    ]);
  });

  it('extends a pending up-segment across multiple progressively higher highs', () => {
    const bis = biChain([
      { kind: 'bottom', bar: 0, price: 90 },
      { kind: 'top', bar: 5, price: 100 },
      { kind: 'bottom', bar: 10, price: 94 },
      { kind: 'top', bar: 15, price: 108 },
      { kind: 'bottom', bar: 20, price: 101 },
      { kind: 'top', bar: 25, price: 120 },
    ]);

    const result = detectXianduan(bis);

    expect(result).toEqual([
      {
        bis,
        direction: 'up',
        startTime: bis[0].start.time,
        endTime: null,
        broken: false,
      },
    ]);
    expect(result[0].bis).toHaveLength(5);
  });

  it('breaks a segment when a same-direction bi fails to extend mid-run, and the outer loop cannot restart from the failing retracement', () => {
    const bis = biChain([
      { kind: 'bottom', bar: 0, price: 90 },
      { kind: 'top', bar: 5, price: 100 },
      { kind: 'bottom', bar: 10, price: 94 },
      { kind: 'top', bar: 15, price: 108 },
      { kind: 'bottom', bar: 20, price: 101 },
      { kind: 'top', bar: 25, price: 105 },
      { kind: 'bottom', bar: 30, price: 102 },
      { kind: 'top', bar: 35, price: 103 },
    ]);

    const result = detectXianduan(bis);

    expect(result).toEqual([
      {
        bis: bis.slice(0, 3),
        direction: 'up',
        startTime: bis[0].start.time,
        endTime: bis[2].end.time,
        broken: true,
      },
    ]);
  });

  it('closes a broken up-segment then opens a valid down-segment starting at the failing retracement', () => {
    const bis = biChain([
      { kind: 'bottom', bar: 0, price: 90 },
      { kind: 'top', bar: 5, price: 100 },
      { kind: 'bottom', bar: 10, price: 94 },
      { kind: 'top', bar: 15, price: 108 },
      { kind: 'bottom', bar: 20, price: 99 },
      { kind: 'top', bar: 25, price: 105 },
      { kind: 'bottom', bar: 30, price: 90 },
    ]);

    const result = detectXianduan(bis);

    expect(result).toEqual([
      {
        bis: bis.slice(0, 3),
        direction: 'up',
        startTime: bis[0].start.time,
        endTime: bis[2].end.time,
        broken: true,
      },
      {
        bis: bis.slice(3, 6),
        direction: 'down',
        startTime: bis[3].start.time,
        endTime: null,
        broken: false,
      },
    ]);
    expect(result[1].startTime).toBe(result[1].bis[0].start.time);
  });

  it('produces segments whose fields and bi references stay consistent with the input', () => {
    const bis = biChain([
      { kind: 'bottom', bar: 0, price: 90 },
      { kind: 'top', bar: 5, price: 100 },
      { kind: 'bottom', bar: 10, price: 94 },
      { kind: 'top', bar: 15, price: 108 },
      { kind: 'bottom', bar: 20, price: 99 },
      { kind: 'top', bar: 25, price: 105 },
      { kind: 'bottom', bar: 30, price: 90 },
    ]);

    const result = detectXianduan(bis);

    expect(result.length).toBeGreaterThan(0);
    for (const segment of result) {
      expect(segment.bis.length).toBeGreaterThanOrEqual(3);
      expect(segment.startTime).toBe(segment.bis[0].start.time);
      if (segment.broken) {
        expect(segment.endTime).toBe(segment.bis[segment.bis.length - 1].end.time);
      } else {
        expect(segment.endTime).toBeNull();
      }
      for (const segBi of segment.bis) {
        expect(bis).toContain(segBi);
      }
    }
  });

  it('marks a segment pending, not broken, when input ends exactly at the minimum 3-bi extension', () => {
    const bis = biChain([
      { kind: 'top', bar: 0, price: 50 },
      { kind: 'bottom', bar: 5, price: 40 },
      { kind: 'top', bar: 10, price: 47 },
      { kind: 'bottom', bar: 15, price: 35 },
    ]);

    const result = detectXianduan(bis);

    expect(result).toEqual([
      {
        bis,
        direction: 'down',
        startTime: bis[0].start.time,
        endTime: null,
        broken: false,
      },
    ]);
  });

  it('marks a segment pending, not broken, when a single dangling retracement bi trails the input', () => {
    const bis = biChain([
      { kind: 'bottom', bar: 0, price: 90 },
      { kind: 'top', bar: 5, price: 100 },
      { kind: 'bottom', bar: 10, price: 94 },
      { kind: 'top', bar: 15, price: 108 },
      { kind: 'bottom', bar: 20, price: 101 },
    ]);

    const result = detectXianduan(bis);

    expect(result).toEqual([
      {
        bis: bis.slice(0, 3),
        direction: 'up',
        startTime: bis[0].start.time,
        endTime: null,
        broken: false,
      },
    ]);
    expect(result[0].bis).toHaveLength(3);
  });
});
