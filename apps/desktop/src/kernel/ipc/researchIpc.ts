import { IpcMethod, IpcService } from 'electron-ipc-decorator';
import type { ResearchApi } from '@kansoku/core/contract/index';
import { researchService } from '@kansoku/core/research/research.service';
import { toEnvelope, type WrapEnvelope } from './envelope.js';

export class ResearchIpc
  extends IpcService
  implements WrapEnvelope<Pick<ResearchApi, 'list' | 'get'>>
{
  static readonly groupName = 'research';

  @IpcMethod()
  list(input: Parameters<ResearchApi['list']>[0]) {
    return toEnvelope('research.list', () => researchService.list(input));
  }

  @IpcMethod()
  get(input: Parameters<ResearchApi['get']>[0]) {
    return toEnvelope('research.get', () => researchService.get(input));
  }
}
