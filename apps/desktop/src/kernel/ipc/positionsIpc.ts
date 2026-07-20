import { IpcMethod, IpcService } from 'electron-ipc-decorator';
import type { PositionsApi } from '@kansoku/core/contract/index';
import { createPositionsService } from '@kansoku/core/cockpit/positions.service';
import { toEnvelope, type WrapEnvelope } from './envelope.js';

const positionsService = createPositionsService();

export class PositionsIpc extends IpcService implements WrapEnvelope<PositionsApi> {
  static readonly groupName = 'positions';

  @IpcMethod()
  list() {
    return toEnvelope('positions.list', () => positionsService.list());
  }
}
