import type { TrainerCoachCall, TrainerDirection } from '@kansoku/pro-api';

export const DIRECTION_LABEL: Record<TrainerDirection | 'neutral', string> = {
  long: '做多',
  short: '做空',
  neutral: '观望',
};

/**
 * The engine's cursor is -1 until the first bar is stepped into, and the AI is reachable from the
 * open, so a call can legitimately carry a bar index that no bar has. The review timeline runs
 * B0..Bn, so rendering it raw would point at a candle that does not exist.
 */
export function coachBarLabel(cursor: number): string {
  return cursor < 0 ? '开局' : `B${cursor}`;
}

export interface CoachPlanLine {
  direction: TrainerDirection | 'neutral';
  prices: string | null;
}

export function coachPlanLine(call: TrainerCoachCall): CoachPlanLine {
  const plan = call.ai.entry_plan;
  return {
    direction: call.ai.direction,
    prices: plan ? `${plan.entry} / ${plan.stop} / ${plan.target1 ?? '—'}` : null,
  };
}

/**
 * Whether the two sides actually disagreed. Only a disagreement can go on to be counted as
 * influence — an AI that agreed moved nobody, and folding those in would drown the contrast.
 *
 * A call made before the trader took any side disagrees with nothing.
 */
export function coachDisagrees(call: TrainerCoachCall): boolean {
  return call.humanBefore !== null && call.ai.direction !== call.humanBefore.direction;
}
