import { IpcMethod, IpcService } from "electron-ipc-decorator";
import type { ResearchApi } from "../../../packages/core/src/contract/index.js";
import {
  applyResearchEditProposal,
  listResearchEditProposals,
  rejectResearchEditProposal,
  undoResearchEditProposal,
} from "../../../packages/core/src/modules/research/researchEdit.service.js";
import { researchChatService } from "../../../packages/core/src/modules/research/researchChat.service.js";
import { researchRefreshService } from "../../../packages/core/src/modules/research/researchRefresh.service.js";
import { researchService } from "../../../packages/core/src/modules/research/research.service.js";
import { toEnvelope, type WrapEnvelope } from "./envelope.js";

export class ResearchIpc extends IpcService implements WrapEnvelope<ResearchApi> {
  static readonly groupName = "research";

  @IpcMethod()
  list(input: Parameters<ResearchApi["list"]>[0]) {
    return toEnvelope("research.list", () => researchService.list(input));
  }

  @IpcMethod()
  get(input: Parameters<ResearchApi["get"]>[0]) {
    return toEnvelope("research.get", () => researchService.get(input));
  }

  @IpcMethod()
  getChat(input: Parameters<ResearchApi["getChat"]>[0]) {
    return toEnvelope("research.getChat", () => researchChatService.getChat(input));
  }

  @IpcMethod()
  postMessage(input: Parameters<ResearchApi["postMessage"]>[0]) {
    return toEnvelope("research.postMessage", () => researchChatService.postMessage(input));
  }

  @IpcMethod()
  abortChat(input: Parameters<ResearchApi["abortChat"]>[0]) {
    return toEnvelope("research.abortChat", () => researchChatService.abortChat(input));
  }

  @IpcMethod()
  suggestions(input: Parameters<ResearchApi["suggestions"]>[0]) {
    return toEnvelope("research.suggestions", () => researchChatService.suggestions(input));
  }

  @IpcMethod()
  getRefresh(input: Parameters<ResearchApi["getRefresh"]>[0]) {
    return toEnvelope("research.getRefresh", () => researchRefreshService.getRefresh(input));
  }

  @IpcMethod()
  startRefresh(input: Parameters<ResearchApi["startRefresh"]>[0]) {
    return toEnvelope("research.startRefresh", () => researchRefreshService.startRefresh(input));
  }

  @IpcMethod()
  abortRefresh(input: Parameters<ResearchApi["abortRefresh"]>[0]) {
    return toEnvelope("research.abortRefresh", () => researchRefreshService.abortRefresh(input));
  }

  @IpcMethod()
  listEdits(input: Parameters<ResearchApi["listEdits"]>[0]) {
    return toEnvelope("research.listEdits", () => listResearchEditProposals(input.path));
  }

  @IpcMethod()
  applyEdit(input: Parameters<ResearchApi["applyEdit"]>[0]) {
    return toEnvelope("research.applyEdit", () => applyResearchEditProposal(input));
  }

  @IpcMethod()
  rejectEdit(input: Parameters<ResearchApi["rejectEdit"]>[0]) {
    return toEnvelope("research.rejectEdit", () => rejectResearchEditProposal(input));
  }

  @IpcMethod()
  undoEdit(input: Parameters<ResearchApi["undoEdit"]>[0]) {
    return toEnvelope("research.undoEdit", () => undoResearchEditProposal(input));
  }
}
