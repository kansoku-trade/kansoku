import { describe, expect, it } from 'vitest';
import { toTs } from '../indicators.js';
import { detectFenxing } from './fenxing.js';
import type { MergedBar } from './inclusion.js';

function mergedBar(time: string, high: number, low: number, barIndex: number): MergedBar {
  return {
    time,
    open: 0,
    high,
    low,
    close: 0,
    volume: 0,
    barIndex,
    sourceIndices: [barIndex],
  };
}

describe('detectFenxing', () => {
  it('returns an empty array for empty input', () => {
    expect(detectFenxing([])).toEqual([]);
  });

  it('returns an empty array for a single bar', () => {
    const bars = [mergedBar('2024-01-01T09:30:00Z', 105, 95, 0)];
    expect(detectFenxing(bars)).toEqual([]);
  });

  it('returns an empty array for two bars (no middle position)', () => {
    const bars = [
      mergedBar('2024-01-01T09:30:00Z', 100, 90, 0),
      mergedBar('2024-01-01T09:31:00Z', 110, 100, 1),
    ];
    expect(detectFenxing(bars)).toEqual([]);
  });

  it('detects a clean top fenxing across three bars', () => {
    const b0 = mergedBar('2024-01-01T09:30:00Z', 100, 95, 0);
    const b1 = mergedBar('2024-01-01T09:31:00Z', 110, 100, 1);
    const b2 = mergedBar('2024-01-01T09:32:00Z', 105, 95, 2);

    const result = detectFenxing([b0, b1, b2]);

    expect(result).toEqual([
      { time: toTs(b1.time), price: 110, kind: 'top', confirmed: false, barIndex: 1 },
    ]);
  });

  it('detects a clean bottom fenxing across three bars', () => {
    const b0 = mergedBar('2024-01-01T09:30:00Z', 105, 100, 0);
    const b1 = mergedBar('2024-01-01T09:31:00Z', 100, 90, 1);
    const b2 = mergedBar('2024-01-01T09:32:00Z', 105, 95, 2);

    const result = detectFenxing([b0, b1, b2]);

    expect(result).toEqual([
      { time: toTs(b1.time), price: 90, kind: 'bottom', confirmed: false, barIndex: 1 },
    ]);
  });

  it('finds no fenxing across three strictly monotonic (stepping up) bars', () => {
    const b0 = mergedBar('2024-01-01T09:30:00Z', 100, 95, 0);
    const b1 = mergedBar('2024-01-01T09:31:00Z', 110, 100, 1);
    const b2 = mergedBar('2024-01-01T09:32:00Z', 120, 110, 2);

    expect(detectFenxing([b0, b1, b2])).toEqual([]);
  });

  it('detects a confirmed top fenxing in the middle of a five-bar run (i=2)', () => {
    const b0 = mergedBar('2024-01-01T09:30:00Z', 100, 90, 0);
    const b1 = mergedBar('2024-01-01T09:31:00Z', 110, 100, 1);
    const b2 = mergedBar('2024-01-01T09:32:00Z', 120, 110, 2);
    const b3 = mergedBar('2024-01-01T09:33:00Z', 115, 100, 3);
    const b4 = mergedBar('2024-01-01T09:34:00Z', 105, 90, 4);

    const result = detectFenxing([b0, b1, b2, b3, b4]);

    expect(result).toEqual([
      { time: toTs(b2.time), price: 120, kind: 'top', confirmed: true, barIndex: 2 },
    ]);
  });

  it('detects an unconfirmed top fenxing at the second-to-last index (i=3=len-2) of a five-bar run', () => {
    const b0 = mergedBar('2024-01-01T09:30:00Z', 100, 90, 0);
    const b1 = mergedBar('2024-01-01T09:31:00Z', 105, 95, 1);
    const b2 = mergedBar('2024-01-01T09:32:00Z', 110, 100, 2);
    const b3 = mergedBar('2024-01-01T09:33:00Z', 120, 110, 3);
    const b4 = mergedBar('2024-01-01T09:34:00Z', 115, 105, 4);

    const result = detectFenxing([b0, b1, b2, b3, b4]);

    expect(result).toEqual([
      { time: toTs(b3.time), price: 120, kind: 'top', confirmed: false, barIndex: 3 },
    ]);
  });

  it('detects multiple alternating fenxings (top, bottom, top) in time-ascending order', () => {
    const b0 = mergedBar('2024-01-01T09:30:00Z', 100, 90, 0);
    const b1 = mergedBar('2024-01-01T09:31:00Z', 130, 120, 1);
    const b2 = mergedBar('2024-01-01T09:32:00Z', 110, 95, 2);
    const b3 = mergedBar('2024-01-01T09:33:00Z', 85, 70, 3);
    const b4 = mergedBar('2024-01-01T09:34:00Z', 105, 90, 4);
    const b5 = mergedBar('2024-01-01T09:35:00Z', 135, 115, 5);
    const b6 = mergedBar('2024-01-01T09:36:00Z', 115, 100, 6);

    const result = detectFenxing([b0, b1, b2, b3, b4, b5, b6]);

    expect(result).toEqual([
      { time: toTs(b1.time), price: 130, kind: 'top', confirmed: true, barIndex: 1 },
      { time: toTs(b3.time), price: 70, kind: 'bottom', confirmed: true, barIndex: 3 },
      { time: toTs(b5.time), price: 135, kind: 'top', confirmed: false, barIndex: 5 },
    ]);
    expect(result.map((f) => f.time)).toEqual([...result.map((f) => f.time)].sort((a, b) => a - b));
  });

  it('requires strict inequality against both neighbors (equal-value bars are not fenxings)', () => {
    const b0 = mergedBar('2024-01-01T09:30:00Z', 100, 90, 0);
    const b1 = mergedBar('2024-01-01T09:31:00Z', 110, 100, 1);
    const b2 = mergedBar('2024-01-01T09:32:00Z', 110, 100, 2);
    const b3 = mergedBar('2024-01-01T09:33:00Z', 100, 90, 3);

    expect(detectFenxing([b0, b1, b2, b3])).toEqual([]);
  });
});
