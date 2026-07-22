import type { Fenxing } from '@kansoku/shared/types';
import { toTs } from '../indicators.js';
import type { MergedBar } from './inclusion.js';

function num(value: string | number): number {
  return typeof value === 'number' ? value : Number(value);
}

export function detectFenxing(merged: MergedBar[]): Fenxing[] {
  const fenxings: Fenxing[] = [];

  for (let i = 1; i <= merged.length - 2; i++) {
    const prev = merged[i - 1];
    const curr = merged[i];
    const next = merged[i + 1];

    const currHigh = num(curr.high);
    const currLow = num(curr.low);
    const prevHigh = num(prev.high);
    const prevLow = num(prev.low);
    const nextHigh = num(next.high);
    const nextLow = num(next.low);

    const isTop =
      currHigh > prevHigh && currHigh > nextHigh && currLow > prevLow && currLow > nextLow;
    const isBottom =
      currLow < prevLow && currLow < nextLow && currHigh < prevHigh && currHigh < nextHigh;

    if (!isTop && !isBottom) continue;

    fenxings.push({
      time: toTs(curr.time),
      price: isTop ? currHigh : currLow,
      kind: isTop ? 'top' : 'bottom',
      confirmed: i < merged.length - 2,
      barIndex: curr.barIndex,
    });
  }

  return fenxings;
}
