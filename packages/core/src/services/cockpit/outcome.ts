import type {
  AnalysisOutcome,
  IntradayPrediction,
  OutcomeStatus,
  RawBar,
} from '@kansoku/shared/types';

export interface OutcomePlan {
  entry?: number;
  stop?: number;
  target1?: number;
}

// A neutral (range-bound) call resolves to held_range after one full regular
// session (6.5h) of post-anchor bars without a close outside the zone.
const NEUTRAL_HELD_HORIZON_SEC = 6.5 * 3600;

function toSec(iso: string): number {
  return Math.floor(Date.parse(iso) / 1000);
}

export function zoneFromPrediction(
  prediction: Pick<IntradayPrediction, 'range_bound_plan' | 'range_plan'> | null | undefined,
): { low: number; high: number } | null {
  const rp = prediction?.range_bound_plan ?? prediction?.range_plan;
  const low = Number(rp?.low);
  const high = Number(rp?.high);
  return Number.isFinite(low) && Number.isFinite(high) && low < high ? { low, high } : null;
}

export function rMultipleFor(
  status: OutcomeStatus,
  direction: 'long' | 'short' | 'neutral',
  plan: OutcomePlan | null | undefined,
): number | null {
  if (direction === 'neutral' || !plan) return null;
  const { entry, stop, target1 } = plan;
  if (entry === undefined || stop === undefined || target1 === undefined) return null;
  const risk = direction === 'long' ? entry - stop : stop - entry;
  if (!(risk > 0)) return null;
  if (status === 'hit_stop') return -1;
  if (status === 'hit_target') {
    const reward = direction === 'long' ? target1 - entry : entry - target1;
    return reward / risk;
  }
  return null;
}

export function attachRMultiple(
  outcome: AnalysisOutcome | null,
  direction: 'long' | 'short' | 'neutral' | null,
  plan: OutcomePlan | null | undefined,
): AnalysisOutcome | null {
  if (!outcome || !direction) return outcome;
  if (outcome.r_multiple != null) return outcome;
  return { ...outcome, r_multiple: rMultipleFor(outcome.status, direction, plan) };
}

function anchorCovered(anchorSec: number, bars: RawBar[]): boolean {
  if (bars.length === 0) return true;
  const firstSec = toSec(bars[0].time);
  if (firstSec <= anchorSec) return true;
  const tolerance = bars.length > 1 ? Math.max(0, toSec(bars[1].time) - firstSec) : Infinity;
  return firstSec - anchorSec <= tolerance;
}

export function judgeOutcome(
  direction: 'long' | 'short' | 'neutral',
  anchor: { time: string; price: number },
  plan: OutcomePlan | null,
  bars: RawBar[],
  zone?: { low: number; high: number } | null,
): AnalysisOutcome | null {
  const anchorSec = toSec(anchor.time);

  if (direction === 'neutral') {
    if (!zone) return null;
    if (!anchorCovered(anchorSec, bars)) return null;

    const following = bars.filter((bar) => toSec(bar.time) > anchorSec);
    if (following.length === 0) {
      return { status: 'open', pct_since_anchor: 0, resolved_at: null };
    }
    const lastClose = Number(following.at(-1)!.close);
    const pct = (lastClose / anchor.price - 1) * 100;
    for (const bar of following) {
      const close = Number(bar.close);
      // Close-based break so a single wick poke doesn't fail the call.
      if (close > zone.high || close < zone.low) {
        return { status: 'broke_range', pct_since_anchor: pct, resolved_at: toSec(bar.time) };
      }
      if (toSec(bar.time) - anchorSec >= NEUTRAL_HELD_HORIZON_SEC) {
        return { status: 'held_range', pct_since_anchor: pct, resolved_at: toSec(bar.time) };
      }
    }
    return { status: 'open', pct_since_anchor: pct, resolved_at: null };
  }

  if (!plan || plan.stop === undefined || plan.target1 === undefined) return null;

  const { stop, target1 } = plan;
  if (!anchorCovered(anchorSec, bars)) return null;

  const following = bars.filter((bar) => toSec(bar.time) > anchorSec);

  if (following.length === 0) {
    return { status: 'open', pct_since_anchor: 0, resolved_at: null };
  }

  for (const bar of following) {
    const high = Number(bar.high);
    const low = Number(bar.low);
    const hitStop = direction === 'long' ? low <= stop : high >= stop;
    const hitTarget = direction === 'long' ? high >= target1 : low <= target1;
    // Same-bar collision: when both stop and target trigger inside one bar, the
    // stop is assumed to have been touched first (conservative).
    if (hitStop) {
      return {
        status: 'hit_stop',
        pct_since_anchor: (Number(following.at(-1)!.close) / anchor.price - 1) * 100,
        resolved_at: toSec(bar.time),
        r_multiple: rMultipleFor('hit_stop', direction, plan),
      };
    }
    if (hitTarget) {
      return {
        status: 'hit_target',
        pct_since_anchor: (Number(following.at(-1)!.close) / anchor.price - 1) * 100,
        resolved_at: toSec(bar.time),
        r_multiple: rMultipleFor('hit_target', direction, plan),
      };
    }
  }

  const lastClose = Number(following.at(-1)!.close);
  return {
    status: 'open',
    pct_since_anchor: (lastClose / anchor.price - 1) * 100,
    resolved_at: null,
  };
}
