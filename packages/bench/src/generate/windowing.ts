import type { RawBar } from '@kansoku/shared/types';

export interface PlanCutoffsInput {
  totalBars: number;
  requiredBefore: number;
  requiredAfter: number;
  windowsPerSymbol: number;
  minCandidateIndex: number;
}

export function firstIndexOnOrAfter(bars: RawBar[], isoDate: string): number {
  const threshold = Date.parse(isoDate);
  for (let i = 0; i < bars.length; i++) {
    if (Date.parse(bars[i].time) >= threshold) return i;
  }
  return bars.length;
}

export function planCutoffIndices(input: PlanCutoffsInput): number[] {
  const { totalBars, requiredBefore, requiredAfter, windowsPerSymbol, minCandidateIndex } = input;
  if (windowsPerSymbol <= 0) return [];

  const firstCandidateIndex = Math.max(requiredBefore - 1, minCandidateIndex);
  const lastCandidateIndex = totalBars - 1 - requiredAfter;
  if (firstCandidateIndex > lastCandidateIndex) return [];

  const candidateSpan = lastCandidateIndex - firstCandidateIndex;
  const maxNonOverlapping = Math.floor(candidateSpan / requiredAfter) + 1;
  const count = Math.min(windowsPerSymbol, maxNonOverlapping);
  if (count <= 0) return [];
  if (count === 1) return [lastCandidateIndex];

  const step = Math.max(requiredAfter, Math.floor(candidateSpan / (count - 1)));
  const indices: number[] = [];
  for (let k = 0; k < count; k++) {
    const idx = Math.min(firstCandidateIndex + k * step, lastCandidateIndex);
    indices.push(idx);
  }
  return Array.from(new Set(indices)).sort((a, b) => a - b);
}

const WEEK_MS = 6 * 24 * 60 * 60 * 1000;

export function lastCompletedWeekIndex(weekBars: RawBar[], cutoffDate: string): number {
  const cutoffMs = Date.parse(cutoffDate);
  let idx = -1;
  for (let i = 0; i < weekBars.length; i++) {
    const weekEndMs = Date.parse(weekBars[i].time) + WEEK_MS;
    if (weekEndMs < cutoffMs) idx = i;
    else break;
  }
  return idx;
}

export function hasSufficientWeekHistory(
  weekBars: RawBar[],
  cutoffDate: string,
  requiredBeforeWeek: number,
): boolean {
  const idx = lastCompletedWeekIndex(weekBars, cutoffDate);
  return idx - requiredBeforeWeek + 1 >= 0;
}
