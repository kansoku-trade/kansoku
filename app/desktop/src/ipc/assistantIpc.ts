import { IpcMethod, IpcService } from "electron-ipc-decorator";
import type { AssistantApi } from "../../../packages/core/src/contract/index.js";
import { assistantChatService } from "../../../packages/core/src/modules/assistant/assistantChat.service.js";
import { toEnvelope, type WrapEnvelope } from "./envelope.js";

export class AssistantIpc extends IpcService implements WrapEnvelope<AssistantApi> {
  static readonly groupName = "assistant";

  @IpcMethod()
  listSessions() {
    return toEnvelope("assistant.listSessions", () => assistantChatService.listSessions());
  }

  @IpcMethod()
  createSession(input: Parameters<AssistantApi["createSession"]>[0]) {
    return toEnvelope("assistant.createSession", () => assistantChatService.createSession(input));
  }

  @IpcMethod()
  deleteSession(input: Parameters<AssistantApi["deleteSession"]>[0]) {
    return toEnvelope("assistant.deleteSession", () => assistantChatService.deleteSession(input));
  }

  @IpcMethod()
  getChat(input: Parameters<AssistantApi["getChat"]>[0]) {
    return toEnvelope("assistant.getChat", () => assistantChatService.getChat(input));
  }

  @IpcMethod()
  postMessage(input: Parameters<AssistantApi["postMessage"]>[0]) {
    return toEnvelope("assistant.postMessage", () => assistantChatService.postMessage(input));
  }

  @IpcMethod()
  abortChat(input: Parameters<AssistantApi["abortChat"]>[0]) {
    return toEnvelope("assistant.abortChat", () => assistantChatService.abortChat(input));
  }
}
