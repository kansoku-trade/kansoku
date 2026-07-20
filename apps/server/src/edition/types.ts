import type { Constructor } from '@tsuki-hono/common';
import type { ProAiExtension, ProChannel, ProHooks } from '@kansoku/pro-api';

export interface ServerProComposition {
  modules: readonly Constructor[];
  realtimeChannels: readonly ProChannel[];
  hooks?: ProHooks;
  aiExtension?: ProAiExtension;
  start?: () => Promise<void> | void;
  dispose?: () => Promise<void> | void;
}
