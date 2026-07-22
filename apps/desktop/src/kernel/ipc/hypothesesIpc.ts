import { IpcMethod, IpcService } from 'electron-ipc-decorator';
import type { HypothesesApi } from '@kansoku/core/contract/index';
import {
  appendRunCard,
  createHypothesis,
  listHypotheses,
  updateHypothesisStatus,
} from '@kansoku/core/journal/hypotheses';
import { toEnvelope, type WrapEnvelope } from './envelope.js';

export class HypothesesIpc extends IpcService implements WrapEnvelope<HypothesesApi> {
  static readonly groupName = 'hypotheses';

  @IpcMethod()
  list() {
    return toEnvelope('hypotheses.list', () => listHypotheses());
  }

  @IpcMethod()
  create(input: Parameters<HypothesesApi['create']>[0]) {
    return toEnvelope('hypotheses.create', () => createHypothesis(input));
  }

  @IpcMethod()
  setStatus(input: Parameters<HypothesesApi['setStatus']>[0]) {
    return toEnvelope('hypotheses.setStatus', () => updateHypothesisStatus(input.id, input.status));
  }

  @IpcMethod()
  addRunCard(input: Parameters<HypothesesApi['addRunCard']>[0]) {
    const { id, ...card } = input;
    return toEnvelope('hypotheses.addRunCard', () => appendRunCard(id, card));
  }
}
