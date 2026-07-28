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

// The bar that fills a market order is also checked against the bracket, and the engine reports
// only the exit when both land on it — so a trade that filled and stopped inside one bar arrives
// as a bare 'stop_hit', reading as if the order had vanished without ever opening. Only the caller
// knows it just submitted, so only the caller can say that the fill happened at all.
export function describeEntryOutcome(
  events: readonly TrainerStepEvent[],
  basePeriod: TrainerBasePeriod,
): string {
  const exit = events.find((e) => e.event === 'stop_hit' || e.event === 'target_hit');
  if (exit) {
    const what = exit.event === 'stop_hit' ? '打到止损' : '触及目标';
    return `按下一根 ${basePeriod} 开盘成交，同一根就${what}，这笔已经结束`;
  }
  if (events.some((e) => e.event === 'horizon_exit')) {
    return `按下一根 ${basePeriod} 开盘成交，同一根就到期强制平仓`;
  }
  return `已按下一根 ${basePeriod} 的开盘价成交`;
}
