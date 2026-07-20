import { IpcMethod, IpcService } from 'electron-ipc-decorator';
import type { CapabilitiesApi } from '@kansoku/core/contract/index';
import { capabilitiesService } from '@kansoku/core/capabilities/capabilities.service';
import { toEnvelope, type WrapEnvelope } from './envelope.js';

export class CapabilitiesIpc extends IpcService implements WrapEnvelope<CapabilitiesApi> {
  static readonly groupName = 'capabilities';

  @IpcMethod()
  get() {
    return toEnvelope('capabilities.get', () => capabilitiesService.get());
  }
}
