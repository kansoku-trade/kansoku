import type { IpcServiceConstructor } from 'electron-ipc-decorator';
import type { ProAiExtension, ProChannel, ProDetectors, ProHooks } from '@kansoku/pro-api';

export interface DesktopProComposition {
  ipcServices: readonly IpcServiceConstructor[];
  realtimeChannels: readonly ProChannel[];
  hooks?: ProHooks;
  aiExtension?: ProAiExtension;
  detectors?: ProDetectors;
  start?: () => Promise<void> | void;
  dispose?: () => Promise<void> | void;
}
