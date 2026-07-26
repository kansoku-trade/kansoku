import type { TrainerDirection } from '@kansoku/pro-api';
import { MIN_GAP } from './orderDraft';

export interface AmendDraft {
  stop: number;
  target: number;
}

// Mirrors packages/bench/src/episode/engine.ts's applyAmendment (`widensStop`) exactly, on
// purpose: the engine forbids any stop widening unconditionally, not only a retreat into loss
// after 1R (TD-EXIT-01's own wording). Gating this UI to TD-EXIT-01's narrower rule would let the
// button submit an amendment the engine then throws EpisodeGuardrailError for. Keep this in
// lockstep with the engine's rule, which is the actual, stricter boundary.
export function widensStop(
  direction: TrainerDirection,
  currentStop: number,
  candidate: number,
): boolean {
  return direction === 'long' ? candidate < currentStop : candidate > currentStop;
}

export function clampAmendStop(
  direction: TrainerDirection,
  reference: number,
  currentStop: number,
  candidate: number,
): number {
  const onCorrectSide =
    direction === 'long'
      ? Math.min(candidate, reference - MIN_GAP)
      : Math.max(candidate, reference + MIN_GAP);
  return widensStop(direction, currentStop, onCorrectSide) ? currentStop : onCorrectSide;
}

export function clampAmendTarget(
  direction: TrainerDirection,
  reference: number,
  candidate: number,
): number {
  return direction === 'long'
    ? Math.max(candidate, reference + MIN_GAP)
    : Math.min(candidate, reference - MIN_GAP);
}
