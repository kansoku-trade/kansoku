import type { Constructor } from '@tsuki-hono/common';
import type { ProAiMemory, ProChannel, ProDetectors, ProHooks } from '@kansoku/pro-api';

export interface ServerProComposition {
  modules: readonly Constructor[];
  realtimeChannels: readonly ProChannel[];
  hooks?: ProHooks;
  aiMemory?: ProAiMemory;
  detectors?: ProDetectors;
  start?: () => Promise<void> | void;
  dispose?: () => Promise<void> | void;
}
