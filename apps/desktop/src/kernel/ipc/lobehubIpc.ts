import { IpcMethod, IpcService } from 'electron-ipc-decorator';
import type { LobeHubApi } from '@kansoku/core/contract/index';
import { lobehubService } from '@kansoku/core/ai/lobehub/lobehub.service';
import { toEnvelope, type WrapEnvelope } from './envelope.js';

export class LobeHubIpc extends IpcService implements WrapEnvelope<LobeHubApi> {
  static readonly groupName = 'lobehub';

  @IpcMethod()
  startDeviceLogin() {
    return toEnvelope('lobehub.startDeviceLogin', () => lobehubService.startDeviceLogin());
  }

  @IpcMethod()
  pollDeviceLogin() {
    return toEnvelope('lobehub.pollDeviceLogin', () => lobehubService.pollDeviceLogin());
  }

  @IpcMethod()
  getAccount() {
    return toEnvelope('lobehub.getAccount', () => lobehubService.getAccount());
  }

  @IpcMethod()
  getCredits() {
    return toEnvelope('lobehub.getCredits', () => lobehubService.getCredits());
  }

  @IpcMethod()
  deleteSession() {
    return toEnvelope('lobehub.deleteSession', () => lobehubService.deleteSession());
  }
}
