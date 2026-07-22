import type { RawBar } from '@kansoku/shared/types';
import { describe, expect, it } from 'vitest';
import { mergeInclusion } from './inclusion.js';

function bar(
  time: string,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
): RawBar {
  return { time, open, high, low, close, volume };
}

describe('mergeInclusion', () => {
  it('returns an empty array for empty input', () => {
    expect(mergeInclusion([])).toEqual([]);
  });

  it('returns a single merged bar for a single input bar', () => {
    const b = bar('t0', 100, 105, 98, 102, 1000);
    expect(mergeInclusion([b])).toEqual([{ ...b, barIndex: 0, sourceIndices: [0] }]);
  });

  it('keeps three bars separate when none are in an inclusion relation (stepping up)', () => {
    const b0 = bar('t0', 100, 110, 100, 108, 500);
    const b1 = bar('t1', 108, 120, 108, 118, 600);
    const b2 = bar('t2', 118, 130, 115, 128, 700);

    const result = mergeInclusion([b0, b1, b2]);

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.barIndex)).toEqual([0, 1, 2]);
    expect(result.map((r) => r.sourceIndices)).toEqual([[0], [1], [2]]);
  });

  it('merges an included bar using the default up direction when no prior bar exists', () => {
    const b0 = bar('t0', 100, 110, 100, 106, 500);
    const b1 = bar('t1', 106, 108, 105, 107, 300);

    const result = mergeInclusion([b0, b1]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      high: 110,
      low: 105,
      close: 107,
      barIndex: 0,
      sourceIndices: [0, 1],
    });
  });

  it('merges an included bar using the down direction inferred from the previous merged bar', () => {
    const bPrior = bar('t0', 117, 120, 115, 119, 400);
    const bA = bar('t1', 108, 110, 100, 104, 450);
    const bB = bar('t2', 107, 108, 105, 106, 200);

    const result = mergeInclusion([bPrior, bA, bB]);

    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({
      high: 108,
      low: 100,
      close: 106,
      volume: 650,
      barIndex: 1,
      sourceIndices: [1, 2],
    });
  });

  it('defaults to the up direction for the very first pair regardless of relative size', () => {
    const b0 = bar('t0', 50, 60, 40, 55, 100);
    const b1 = bar('t1', 55, 58, 45, 50, 80);

    const result = mergeInclusion([b0, b1]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      high: 60,
      low: 45,
      barIndex: 0,
      sourceIndices: [0, 1],
    });
  });

  it('cascades multiple inclusions into a single merged bar', () => {
    const b0 = bar('t0', 100, 130, 90, 110, 100);
    const b1 = bar('t1', 110, 125, 95, 115, 100);
    const b2 = bar('t2', 115, 120, 100, 112, 100);
    const b3 = bar('t3', 112, 115, 105, 108, 100);

    const result = mergeInclusion([b0, b1, b2, b3]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      barIndex: 0,
      sourceIndices: [0, 1, 2, 3],
      high: 130,
      low: 105,
      open: 100,
      close: 108,
      volume: 400,
    });
  });

  it('merges only the pair that is actually included inside a longer stepping sequence', () => {
    const b0 = bar('t0', 95, 100, 90, 98, 100);
    const b1 = bar('t1', 98, 110, 95, 108, 120);
    const b2 = bar('t2', 108, 120, 105, 118, 130);
    const b3 = bar('t3', 118, 118, 108, 115, 90);
    const b4 = bar('t4', 115, 130, 112, 125, 140);

    const result = mergeInclusion([b0, b1, b2, b3, b4]);

    expect(result).toHaveLength(4);
    expect(result.map((r) => r.sourceIndices)).toEqual([[0], [1], [2, 3], [4]]);
    expect(result[2]).toMatchObject({
      barIndex: 2,
      sourceIndices: [2, 3],
      high: 120,
      low: 108,
      open: 108,
      close: 115,
      volume: 220,
    });
  });

  it('preserves time/volume/open/close merge semantics', () => {
    const b0 = bar('t-old', 10, 50, 20, 30, 1000);
    const b1 = bar('t-new', 32, 45, 25, 40, 500);

    const result = mergeInclusion([b0, b1]);

    expect(result).toHaveLength(1);
    expect(result[0].time).toBe('t-new');
    expect(result[0].volume).toBe(1500);
    expect(result[0].open).toBe(10);
    expect(result[0].close).toBe(40);
  });

  it('keeps sourceIndices in original order through a cascade', () => {
    const b0 = bar('t0', 100, 130, 90, 110, 50);
    const b1 = bar('t1', 110, 125, 95, 115, 50);
    const b2 = bar('t2', 115, 120, 100, 112, 50);

    const result = mergeInclusion([b0, b1, b2]);

    expect(result).toHaveLength(1);
    expect(result[0].sourceIndices).toEqual([0, 1, 2]);
  });
});
