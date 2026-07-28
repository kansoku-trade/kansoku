import type {
  TrainerAmendCheck,
  TrainerApi,
  TrainerCoachCall,
  TrainerEnvelope,
  TrainerFillState,
  TrainerFillTask,
  TrainerLesson,
  TrainerOpened,
  TrainerPoolCounts,
  TrainerReveal,
  TrainerReviewPayload,
  TrainerStats,
  TrainerStepResult,
  WrapTrainerEnvelope,
} from '@kansoku/pro-api';
import { getShellRpc } from './shellRpc';

export type TrainerBridge = WrapTrainerEnvelope<TrainerApi>;

export function getTrainerBridge(
  win: unknown = typeof window === 'undefined' ? undefined : window,
): TrainerBridge | null {
  const rpc = getShellRpc(win);
  if (!rpc) return null;
  const call = <T>(channel: string, input?: unknown) =>
    (input === undefined
      ? rpc.invoke(`trainer.${channel}`)
      : rpc.invoke(`trainer.${channel}`, input)) as Promise<TrainerEnvelope<T>>;
  return {
    listPool: () => call<TrainerPoolCounts>('listPool'),
    getFill: () => call<TrainerFillState>('getFill'),
    startFill: (input) => call<TrainerFillTask>('startFill', input),
    abortFill: (input) => call<TrainerFillTask>('abortFill', input),
    setAutoRefill: (input) => call<TrainerFillState>('setAutoRefill', input),
    open: (input) => call<TrainerOpened>('open', input),
    resume: (input) => call<TrainerOpened>('resume', input),
    submit: (input) => call<TrainerStepResult>('submit', input),
    step: (input) => call<TrainerStepResult>('step', input),
    amend: (input) => call<TrainerStepResult>('amend', input),
    validateAmend: (input) => call<TrainerAmendCheck>('validateAmend', input),
    cancel: (input) => call<TrainerStepResult>('cancel', input),
    exitNextOpen: (input) => call<TrainerStepResult>('exitNextOpen', input),
    add: (input) => call<TrainerStepResult>('add', input),
    reduce: (input) => call<TrainerStepResult>('reduce', input),
    reveal: (input) => call<TrainerReveal>('reveal', input),
    coach: (input) => call<TrainerCoachCall>('coach', input),
    annotate: (input) => call<TrainerCoachCall>('annotate', input),
    review: (input) => call<TrainerReviewPayload>('review', input),
    stats: () => call<TrainerStats>('stats'),
    saveLesson: (input) => call<TrainerLesson>('saveLesson', input),
    syncLesson: (input) => call<TrainerLesson>('syncLesson', input),
  };
}
