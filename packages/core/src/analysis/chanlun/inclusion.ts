import type { RawBar } from '@kansoku/shared/types';

export interface MergedBar extends RawBar {
  barIndex: number;
  sourceIndices: number[];
}

type Direction = 'up' | 'down';

function num(value: string | number): number {
  return typeof value === 'number' ? value : Number(value);
}

function isIncluded(a: MergedBar, b: RawBar): boolean {
  const aHigh = num(a.high);
  const aLow = num(a.low);
  const bHigh = num(b.high);
  const bLow = num(b.low);
  return (aHigh >= bHigh && aLow <= bLow) || (bHigh >= aHigh && bLow <= aLow);
}

function inferDirection(merged: MergedBar[]): Direction {
  if (merged.length < 2) return 'up';
  const a = merged[merged.length - 1];
  const prev = merged[merged.length - 2];
  return num(a.high) > num(prev.high) ? 'up' : 'down';
}

export function mergeInclusion(bars: RawBar[]): MergedBar[] {
  const merged: MergedBar[] = [];

  for (let i = 0; i < bars.length; i++) {
    const current = bars[i];

    if (merged.length === 0) {
      merged.push({ ...current, barIndex: 0, sourceIndices: [i] });
      continue;
    }

    const a = merged[merged.length - 1];
    if (!isIncluded(a, current)) {
      merged.push({ ...current, barIndex: merged.length, sourceIndices: [i] });
      continue;
    }

    const direction = inferDirection(merged);
    const aHigh = num(a.high);
    const aLow = num(a.low);
    const bHigh = num(current.high);
    const bLow = num(current.low);

    merged[merged.length - 1] = {
      ...a,
      time: current.time,
      open: a.open,
      close: current.close,
      volume: num(a.volume) + num(current.volume),
      high: direction === 'up' ? Math.max(aHigh, bHigh) : Math.min(aHigh, bHigh),
      low: direction === 'up' ? Math.max(aLow, bLow) : Math.min(aLow, bLow),
      barIndex: a.barIndex,
      sourceIndices: [...a.sourceIndices, i],
    };
  }

  return merged;
}
