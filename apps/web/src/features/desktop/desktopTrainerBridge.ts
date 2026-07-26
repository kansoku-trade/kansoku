import type {
  TrainerApi,
  TrainerEnvelope,
  TrainerOpened,
  TrainerPoolCounts,
  TrainerReveal,
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
    open: (input) => call<TrainerOpened>('open', input),
    resume: (input) => call<TrainerOpened>('resume', input),
    submit: (input) => call<TrainerStepResult>('submit', input),
    step: (input) => call<TrainerStepResult>('step', input),
    amend: (input) => call<TrainerStepResult>('amend', input),
    cancel: (input) => call<TrainerStepResult>('cancel', input),
    exitNextOpen: (input) => call<TrainerStepResult>('exitNextOpen', input),
    reveal: (input) => call<TrainerReveal>('reveal', input),
  };
}
