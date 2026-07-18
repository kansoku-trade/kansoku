import { IpcMethod, IpcService } from "electron-ipc-decorator";
import type { AnnotationsApi } from "../../../../packages/core/src/contract/index.js";
import { annotationsService } from "../../../../packages/core/src/modules/annotations/annotations.service.js";
import { toEnvelope, type WrapEnvelope } from "./envelope.js";

export class AnnotationsIpc extends IpcService implements WrapEnvelope<AnnotationsApi> {
  static readonly groupName = "annotations";

  @IpcMethod()
  list(input: Parameters<AnnotationsApi["list"]>[0]) {
    return toEnvelope("annotations.list", () => annotationsService.list(input));
  }

  @IpcMethod()
  replace(input: Parameters<AnnotationsApi["replace"]>[0]) {
    return toEnvelope("annotations.replace", () => annotationsService.replace(input));
  }
}
