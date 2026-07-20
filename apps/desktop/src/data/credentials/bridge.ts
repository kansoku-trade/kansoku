import { credentialsService } from '@kansoku/core/credentials/credentials.service';
import { CREDENTIALS_CHANNELS } from './channels.js';

export interface CredentialsBridgeHandlers {
  get(): ReturnType<typeof credentialsService.status>;
}

export function createCredentialsBridgeHandlers(): CredentialsBridgeHandlers {
  return { get: () => credentialsService.status() };
}

export interface IpcMainLike {
  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void;
}

export function registerCredentialsIpc(
  ipcMain: IpcMainLike,
  handlers: CredentialsBridgeHandlers,
): void {
  ipcMain.handle(CREDENTIALS_CHANNELS.get, () => handlers.get());
}
