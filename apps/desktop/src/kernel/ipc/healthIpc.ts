import { IpcMethod, IpcService } from 'electron-ipc-decorator';
import type { HealthApi } from '@kansoku/core/contract/index';
import { healthService } from '@kansoku/core/health/health.service';
import { toEnvelope, type WrapEnvelope } from './envelope.js';

export class HealthIpc extends IpcService implements WrapEnvelope<HealthApi> {
  static readonly groupName = 'health';

  @IpcMethod()
  get() {
    return toEnvelope('health.get', () => healthService.get());
  }
}
