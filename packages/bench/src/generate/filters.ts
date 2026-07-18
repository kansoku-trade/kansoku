import type { RawBar } from '@kansoku/shared/types';

export type AnomalyReason =
  'insufficient_before' | 'insufficient_after' | 'close_to_close_gap' | 'zero_volume_halt';

export interface CheckAnomaliesInput {
  bars: RawBar[];
  cutoffIndex: number;
  requiredBefore: number;
  requiredAfter: number;
  gapThreshold?: number;
  anomalyLookback?: number;
}

export function checkAnomalies(input: CheckAnomaliesInput): AnomalyReason[] {
  const { bars, cutoffIndex, requiredBefore, requiredAfter } = input;
  const gapThreshold = input.gapThreshold ?? 0.2;
  const anomalyLookback = input.anomalyLookback ?? 5;

  const reasons: AnomalyReason[] = [];
  if (cutoffIndex - requiredBefore + 1 < 0) reasons.push('insufficient_before');
  if (cutoffIndex + requiredAfter >= bars.length) reasons.push('insufficient_after');
  if (reasons.length > 0) return reasons;

  const rangeStart = Math.max(0, cutoffIndex - anomalyLookback);
  const rangeEnd = cutoffIndex + requiredAfter;

  for (let i = Math.max(1, rangeStart); i <= rangeEnd; i++) {
    const prevClose = Number(bars[i - 1].close);
    const close = Number(bars[i].close);
    if (prevClose === 0) continue;
    const change = Math.abs(close - prevClose) / prevClose;
    if (change > gapThreshold) {
      reasons.push('close_to_close_gap');
      break;
    }
  }

  for (let i = cutoffIndex + 1; i <= rangeEnd; i++) {
    if (Number(bars[i].volume) === 0) {
      reasons.push('zero_volume_halt');
      break;
    }
  }

  return reasons;
}
