import type { IpcServiceConstructor } from 'electron-ipc-decorator';
import type { ProAiMemory, ProChannel, ProDetectors, ProHooks } from '@kansoku/pro-api';

export interface DesktopProComposition {
  ipcServices: readonly IpcServiceConstructor[];
  realtimeChannels: readonly ProChannel[];
  hooks?: ProHooks;
  aiMemory?: ProAiMemory;
  detectors?: ProDetectors;
  start?: () => Promise<void> | void;
  dispose?: () => Promise<void> | void;
}
