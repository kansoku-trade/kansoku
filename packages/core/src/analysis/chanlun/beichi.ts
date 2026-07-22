import type { Xianduan } from '@kansoku/shared/types';

export interface BeichiEvent {
  fromSegmentIdx: number;
  toSegmentIdx: number;
  direction: 'up' | 'down';
  fromExtreme: number;
  toExtreme: number;
  fromArea: number;
  toArea: number;
}

function segmentBarRange(
  seg: Xianduan,
  barTimes: number[],
): { startIdx: number; endIdx: number } | null {
  const startIdx = barTimes.findIndex((t) => t >= seg.startTime);
  if (startIdx === -1) return null;

  let endIdx = barTimes.length - 1;
  if (seg.endTime !== null) {
    endIdx = -1;
    for (let k = barTimes.length - 1; k >= 0; k--) {
      if (barTimes[k] <= seg.endTime) {
        endIdx = k;
        break;
      }
    }
  }

  return endIdx < startIdx ? null : { startIdx, endIdx };
}

function sumAbsHist(hist: (number | null)[], start: number, end: number): number {
  let sum = 0;
  for (let k = start; k <= end; k++) {
    const v = hist[k];
    if (v !== null) sum += Math.abs(v);
  }
  return sum;
}

function segmentExtreme(seg: Xianduan): number {
  const prices = [seg.bis[0].start.price];
  for (const bi of seg.bis) prices.push(bi.end.price);
  return seg.direction === 'up' ? Math.max(...prices) : Math.min(...prices);
}

export function detectBeichi(
  xianduans: Xianduan[],
  barTimes: number[],
  macdHist: (number | null)[],
): BeichiEvent[] {
  const events: BeichiEvent[] = [];

  for (let i = 2; i < xianduans.length; i++) {
    const prev = xianduans[i - 2];
    const curr = xianduans[i];
    if (prev.direction !== curr.direction) continue;

    const prevRange = segmentBarRange(prev, barTimes);
    const currRange = segmentBarRange(curr, barTimes);
    if (!prevRange || !currRange) continue;

    const prevArea = sumAbsHist(macdHist, prevRange.startIdx, prevRange.endIdx);
    const currArea = sumAbsHist(macdHist, currRange.startIdx, currRange.endIdx);
    const prevExtreme = segmentExtreme(prev);
    const currExtreme = segmentExtreme(curr);

    const newExtreme =
      curr.direction === 'up' ? currExtreme > prevExtreme : currExtreme < prevExtreme;
    if (!newExtreme || currArea >= prevArea) continue;

    events.push({
      fromSegmentIdx: i - 2,
      toSegmentIdx: i,
      direction: curr.direction,
      fromExtreme: prevExtreme,
      toExtreme: currExtreme,
      fromArea: prevArea,
      toArea: currArea,
    });
  }

  return events;
}
