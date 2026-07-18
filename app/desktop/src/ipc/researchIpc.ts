import { IpcMethod, IpcService } from "electron-ipc-decorator";
import type { ResearchApi } from "../../../packages/core/src/contract/index.js";
import { researchService } from "../../../packages/core/src/modules/research/research.service.js";
import { toEnvelope, type WrapEnvelope } from "./envelope.js";

export class ResearchIpc extends IpcService implements WrapEnvelope<Pick<ResearchApi, "list" | "get">> {
  static readonly groupName = "research";

  @IpcMethod()
  list(input: Parameters<ResearchApi["list"]>[0]) {
    return toEnvelope("research.list", () => researchService.list(input));
  }

  @IpcMethod()
  get(input: Parameters<ResearchApi["get"]>[0]) {
    return toEnvelope("research.get", () => researchService.get(input));
  }
}
