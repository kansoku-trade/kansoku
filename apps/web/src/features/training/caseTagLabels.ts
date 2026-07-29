import type { TrainerCaseTag } from '@kansoku/pro-api';

export const TRAINER_CASE_TAG_LABEL: Record<TrainerCaseTag, string> = {
  'trend-follow': '趋势跟随',
  'pullback-entry': '回调买点',
  'false-breakout': '假突破',
  'top-reversal': '顶部反转',
  'range-bound': '区间震荡',
};
