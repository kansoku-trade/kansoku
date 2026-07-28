import type { TrainerView, TrainerViewPeriod } from '@kansoku/pro-api';
import type { RawBar } from '@kansoku/shared/types';
import { periodBucketStart } from './epilogueTiers';

export interface RemainingBars {
  count: number;
  approximate: boolean;
}

// How many base bars a full bucket of `period` holds, counted off the bars already revealed rather
// than from a table. A US session's length is not a constant the client knows — 'day' is 78 bars of
// 5m and 26 of 15m — but the case's own history has that ratio in it already. The widest bucket is
// the honest measure: the runs at either end are usually partial, because a case neither starts nor
// stops on a bucket boundary.
function barsPerBucket(period: TrainerViewPeriod, baseBars: readonly RawBar[]): number {
  if (baseBars.length === 0) return 1;
  const counts = new Map<string, number>();
  for (const bar of baseBars) {
    const key = periodBucketStart(period, bar.time);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Math.max(...counts.values());
}

// `view.remainingBars` counts BASE bars, so quoting it while the chart shows 1h claims twelve times
// the bars that are actually left. Re-expressed in whatever tier is on screen, it answers the
// question the trader is really asking: how many more times can I press 步进.
export function remainingBarsAt(view: TrainerView, period: TrainerViewPeriod): RemainingBars {
  const left = Math.max(0, view.remainingBars);
  const perBucket = barsPerBucket(period, view.bars.base);
  if (perBucket <= 1) return { count: left, approximate: false };
  // Ceil, not round: a trailing partial bucket is still one more step.
  return { count: Math.ceil(left / perBucket), approximate: true };
}
