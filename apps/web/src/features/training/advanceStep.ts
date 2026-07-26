import type { TrainerBasePeriod, TrainerEvent, TrainerStepEvent } from '@kansoku/pro-api';

export const PLAYBACK_SPEEDS = [0.5, 1, 2, 4, 8] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

const BASE_PLAYBACK_INTERVAL_MS = 600;

export function playbackIntervalMs(speed: PlaybackSpeed): number {
  return BASE_PLAYBACK_INTERVAL_MS / speed;
}

// Exhaustive on purpose, mirroring session.ts's NOTABLE_EVENT: the wire only ever puts the
// notable half of TrainerEvent into events[], but a Record over the full union means a future
// event type forces a decision here instead of silently rendering "undefined".
const STEP_EVENT_LABEL: Record<TrainerEvent, string> = {
  observed: '观察',
  abstained: '弃权',
  waiting_fill: '等待成交',
  holding: '持有中',
  filled: '触发挂单成交',
  cancelled: '挂单被取消',
  no_fill: '挂单超时作废',
  stop_hit: '打到止损',
  target_hit: '触及目标',
  manual_exit: '手动平仓',
  horizon_exit: '到期强制平仓',
};

export function describeStepEvent(event: TrainerStepEvent, basePeriod: TrainerBasePeriod): string {
  return `第 ${event.barOffset} 根 ${basePeriod} ${STEP_EVENT_LABEL[event.event]}`;
}

export function describeStepEvents(
  events: readonly TrainerStepEvent[],
  basePeriod: TrainerBasePeriod,
): string {
  return events.map((event) => describeStepEvent(event, basePeriod)).join('，');
}
