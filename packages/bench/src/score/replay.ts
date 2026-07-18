import type { RawBar } from '@kansoku/shared/types';

export type Direction = 'long' | 'short';

export type ReplayOutcome = 'win' | 'loss' | 'timeout_flat' | 'no_fill' | 'format_violation';

export interface ReplayBar {
  high: number;
  low: number;
  close: number;
}

export interface ReplayInput {
  direction: Direction;
  entry: number;
  stop: number;
  target: number;
  bars: ReplayBar[];
}

export interface ReplayResult {
  outcome: ReplayOutcome;
  score: number | null;
  r: number | null;
}

export function num(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}

export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

export function coerceReplayBar(bar: RawBar): ReplayBar {
  return { high: num(bar.high), low: num(bar.low), close: num(bar.close) };
}

function violation(): ReplayResult {
  return { outcome: 'format_violation', score: null, r: null };
}

export function replayDirectional(input: ReplayInput): ReplayResult {
  const { direction, entry, stop, target, bars } = input;

  if (![entry, stop, target].every((price) => Number.isFinite(price))) return violation();
  const wrongStop = direction === 'long' ? stop >= entry : stop <= entry;
  const wrongTarget = direction === 'long' ? target <= entry : target >= entry;
  if (wrongStop || wrongTarget) return violation();

  const stopDist = Math.abs(entry - stop);
  if (stopDist === 0) return violation();
  const r = Math.abs(target - entry) / stopDist;
  if (!(r > 0)) return violation();

  const fillWindow = Math.min(3, bars.length);
  let fillIdx = -1;
  for (let i = 0; i < fillWindow; i++) {
    const bar = bars[i];
    if (bar.low <= entry && entry <= bar.high) {
      fillIdx = i;
      break;
    }
  }
  if (fillIdx === -1) return { outcome: 'no_fill', score: null, r };

  for (let i = fillIdx; i < bars.length; i++) {
    const bar = bars[i];
    const stopHit = direction === 'long' ? bar.low <= stop : bar.high >= stop;
    const targetHit = direction === 'long' ? bar.high >= target : bar.low <= target;
    if (stopHit) return { outcome: 'loss', score: -1, r };
    if (targetHit) return { outcome: 'win', score: r, r };
  }

  const last = bars.at(-1)!;
  const signed =
    direction === 'long' ? (last.close - entry) / stopDist : (entry - last.close) / stopDist;
  return { outcome: 'timeout_flat', score: clamp(signed, -1, r), r };
}
