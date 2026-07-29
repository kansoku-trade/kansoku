import type { TrainerCoachCall, TrainerDirection, TrainerView } from '@kansoku/pro-api';

export const DIRECTION_LABEL: Record<TrainerDirection | 'neutral', string> = {
  long: '做多',
  short: '做空',
  neutral: '观望',
};

/**
 * The AI stays sealed until the trader has committed to a direction and three prices of their own.
 *
 * Asking first turns the session into copying an answer, and it anchors every annotation they will
 * later give — "the AI was right" quietly becomes "we agreed". The runtime refuses the same call
 * for the same reason; this only keeps the button from lying about being available.
 */
export function coachUnlocked(view: TrainerView): boolean {
  return view.submitted;
}

export function coachLockReason(view: TrainerView): string | undefined {
  return coachUnlocked(view) ? undefined : '先提交你自己的方向与三价，AI 的看法才解锁';
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
 */
export function coachDisagrees(call: TrainerCoachCall): boolean {
  return call.ai.direction !== call.humanBefore.direction;
}
