import { IpcMethod, IpcService } from 'electron-ipc-decorator';
import type { CanvasApi } from '@kansoku/core/contract/index';
import { canvasService } from '@kansoku/core/canvas/canvas.service';
import { toEnvelope, type WrapEnvelope } from './envelope.js';

export class CanvasIpc extends IpcService implements WrapEnvelope<CanvasApi> {
  static readonly groupName = 'canvas';

  @IpcMethod()
  list() {
    return toEnvelope('canvas.list', () => canvasService.list());
  }

  @IpcMethod()
  get(input: Parameters<CanvasApi['get']>[0]) {
    return toEnvelope('canvas.get', () => canvasService.get(input));
  }

  @IpcMethod()
  save(input: Parameters<CanvasApi['save']>[0]) {
    return toEnvelope('canvas.save', () => canvasService.save(input));
  }

  @IpcMethod()
  recordCheck(input: Parameters<CanvasApi['recordCheck']>[0]) {
    return toEnvelope('canvas.recordCheck', () => canvasService.recordCheck(input));
  }
}
