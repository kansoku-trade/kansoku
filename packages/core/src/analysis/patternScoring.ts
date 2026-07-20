import { classifySession } from '../marketdata/session.js';

export type { PatternScoringContext } from '@kansoku/pro-api';

const AVG_VOL_WINDOW = 20;
const RELVOL_HIGH = 1.5;

export const SCORE_FULL_MARKER = 65;
export const SCORE_DOT_MARKER = 45;

function windowAvg(values: number[], endExclusive: number, window: number): number {
  const from = Math.max(0, endExclusive - window);
  let sum = 0;
  let count = 0;
  for (let j = from; j < endExclusive; j++) {
    if (!Number.isFinite(values[j])) continue;
    sum += values[j];
    count += 1;
  }
  return count ? sum / count : 0;
}

// Overnight bars are so thin that a structural signal (123 / divergence / beichi / MACD
// structure) anchored on one is usually noise — keep it only on a genuine volume impulse.
export function offSessionSignalKeeper(
  timesTs: number[],
  vols: number[],
): (time: number) => boolean {
  const idxByTime = new Map<number, number>();
  for (let i = 0; i < timesTs.length; i++) idxByTime.set(timesTs[i], i);
  return (time: number) => {
    if (classifySession(time) !== 'overnight') return true;
    const i = idxByTime.get(time);
    if (i === undefined) return true;
    const avgVol = windowAvg(vols, i, AVG_VOL_WINDOW);
    return avgVol > 0 && vols[i] >= RELVOL_HIGH * avgVol;
  };
}
