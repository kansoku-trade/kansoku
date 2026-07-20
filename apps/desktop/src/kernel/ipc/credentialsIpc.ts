import { IpcMethod, IpcService } from 'electron-ipc-decorator';
import type { CredentialsApi } from '@kansoku/core/contract/index';
import { credentialsService } from '@kansoku/core/credentials/credentials.service';
import { toEnvelope, type WrapEnvelope } from './envelope.js';

export class CredentialsIpc extends IpcService implements WrapEnvelope<CredentialsApi> {
  static readonly groupName = 'credentials';

  @IpcMethod()
  status() {
    return toEnvelope('credentials.status', () => credentialsService.status());
  }

  @IpcMethod()
  opencliStatus() {
    return toEnvelope('credentials.opencliStatus', () => credentialsService.opencliStatus());
  }
}
