import { IpcMethod, IpcService } from "electron-ipc-decorator";
import type { CapabilitiesApi } from "../../../../packages/core/src/contract/index.js";
import { capabilitiesService } from "../../../../packages/core/src/modules/capabilities/capabilities.service.js";
import { toEnvelope, type WrapEnvelope } from "./envelope.js";

export class CapabilitiesIpc extends IpcService implements WrapEnvelope<CapabilitiesApi> {
  static readonly groupName = "capabilities";

  @IpcMethod()
  get() {
    return toEnvelope("capabilities.get", () => capabilitiesService.get());
  }
}
