import { IpcMethod, IpcService } from 'electron-ipc-decorator';
import type { ChatApi } from '@kansoku/core/contract/index';
import { chatService } from '@kansoku/core/ai/chat/chat.service';
import { toEnvelope, type WrapEnvelope } from './envelope.js';

export class ChatIpc extends IpcService implements WrapEnvelope<ChatApi> {
  static readonly groupName = 'chat';

  @IpcMethod()
  get(input: Parameters<ChatApi['get']>[0]) {
    return toEnvelope('chat.get', () => chatService.get(input));
  }

  @IpcMethod()
  postMessage(input: Parameters<ChatApi['postMessage']>[0]) {
    return toEnvelope('chat.postMessage', () => chatService.postMessage(input));
  }

  @IpcMethod()
  abort(input: Parameters<ChatApi['abort']>[0]) {
    return toEnvelope('chat.abort', () => chatService.abort(input));
  }

  @IpcMethod()
  suggestions(input: Parameters<ChatApi['suggestions']>[0]) {
    return toEnvelope('chat.suggestions', () => chatService.suggestions(input));
  }
}
