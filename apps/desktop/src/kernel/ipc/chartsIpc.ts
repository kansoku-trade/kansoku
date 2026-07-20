import { IpcMethod, IpcService } from 'electron-ipc-decorator';
import type { ChartsApi } from '@kansoku/core/contract/index';
import { chartsService } from '@kansoku/core/charts/charts.service';
import { toEnvelope, type WrapEnvelope } from './envelope.js';

export class ChartsIpc extends IpcService implements WrapEnvelope<ChartsApi> {
  static readonly groupName = 'charts';

  @IpcMethod()
  list(input?: Parameters<ChartsApi['list']>[0]) {
    return toEnvelope('charts.list', () => chartsService.list(input));
  }

  @IpcMethod()
  get(input: Parameters<ChartsApi['get']>[0]) {
    return toEnvelope('charts.get', () => chartsService.get(input));
  }

  @IpcMethod()
  create(input: Parameters<ChartsApi['create']>[0]) {
    return toEnvelope('charts.create', () => chartsService.create(input));
  }

  @IpcMethod()
  update(input: Parameters<ChartsApi['update']>[0]) {
    return toEnvelope('charts.update', () => chartsService.update(input));
  }

  @IpcMethod()
  remove(input: Parameters<ChartsApi['remove']>[0]) {
    return toEnvelope('charts.remove', () => chartsService.remove(input));
  }

  @IpcMethod()
  built(input: Parameters<ChartsApi['built']>[0]) {
    return toEnvelope('charts.built', () => chartsService.built(input));
  }
}
