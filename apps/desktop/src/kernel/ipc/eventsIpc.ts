import { IpcMethod, IpcService } from 'electron-ipc-decorator';
import type { EventsApi } from '@kansoku/core/contract/index';
import { eventsService } from '@kansoku/core/events/events.service';
import { toEnvelope, type WrapEnvelope } from './envelope.js';

export class EventsIpc extends IpcService implements WrapEnvelope<EventsApi> {
  static readonly groupName = 'events';

  @IpcMethod()
  list(input: Parameters<EventsApi['list']>[0]) {
    return toEnvelope('events.list', () => eventsService.list(input));
  }

  @IpcMethod()
  get(input: Parameters<EventsApi['get']>[0]) {
    return toEnvelope('events.get', () => eventsService.get(input));
  }

  @IpcMethod()
  sourceHealth() {
    return toEnvelope('events.sourceHealth', () => eventsService.sourceHealth());
  }

  @IpcMethod()
  generateCanvas(input: Parameters<EventsApi['generateCanvas']>[0]) {
    return toEnvelope('events.generateCanvas', () => eventsService.generateCanvas(input));
  }
}
